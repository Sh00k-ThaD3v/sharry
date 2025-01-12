package sharry.restserver

import java.nio.file.{Files, Paths}

import cats.effect._
import cats.implicits._

import sharry.common._

import org.log4s._

object Main extends IOApp {
  private[this] val logger = getLogger

  val blockingEC = ThreadFactories.cached[IO](
    ThreadFactories.ofName("sharry-restserver-blocking")
  )
  val connectEC =
    ThreadFactories.fixed[IO](5, ThreadFactories.ofName("sharry-dbconnect"))

  val restEC =
    ThreadFactories.workSteal[IO](ThreadFactories.ofNameFJ("sharry-restserver"))

  def run(args: List[String]) = {
    args match {
      case file :: Nil =>
        val path = Paths.get(file).toAbsolutePath.normalize
        logger.info(s"Using given config file: $path")
        System.setProperty("config.file", file)
      case _ =>
        Option(System.getProperty("config.file")) match {
          case Some(f) if f.nonEmpty =>
            val path = Paths.get(f).toAbsolutePath.normalize
            if (!Files.exists(path)) {
              logger.info(s"Not using config file '$f' because it doesn't exist")
              System.clearProperty("config.file")
            } else
              logger.info(s"Using config file from system properties: $f")
          case _ =>
        }
    }

    val cfg = ConfigFile.loadConfig
    val banner = Banner(
      BuildInfo.version,
      BuildInfo.gitHeadCommit,
      cfg.backend.jdbc.url,
      Option(System.getProperty("config.file")),
      cfg.baseUrl
    )
    logger.info(s"\n${banner.render("***>")}")

    val pools = for {
      bec <- blockingEC
      cec <- connectEC
      rec <- restEC
    } yield Pools(cec, bec, rec)

    if (EnvMode.current.isDev) {
      logger.warn(">>>>>   Sharry is running in DEV mode!   <<<<<")
    }
    logger.info(s"Alias-Member feature enabled: ${cfg.aliasMemberEnabled}")

    pools.use { p =>
      RestServer
        .stream[IO](cfg, p)
        .compile
        .drain
        .as(ExitCode.Success)
    }
  }
}
