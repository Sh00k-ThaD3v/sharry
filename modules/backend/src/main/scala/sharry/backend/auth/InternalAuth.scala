package sharry.backend.auth

import cats.data.Kleisli
import cats.effect._
import cats.implicits._

import sharry.backend.PasswordCrypt
import sharry.backend.account.OAccount
import sharry.common._
import sharry.common.syntax.all._
import sharry.store.records.RAccount

import org.log4s._

final class InternalAuth[F[_]: Async](cfg: AuthConfig, op: OAccount[F]) {

  private[this] val logger = getLogger

  def login: LoginModule[F] =
    LoginModule.enabledState(cfg.internal.enabled, op, AccountSource.intern)(
      Kleisli(up =>
        Ident.fromString(up.user) match {
          case Right(login) =>
            def okResult(accId: AccountId) =
              op.updateLoginStats(accId) *>
                AuthToken.user(accId, cfg.serverSecret).map(LoginResult.ok)

            for {
              _ <- logger.ftrace(s"Internal auth: doing account lookup: ${login.id}")
              data <- op.findByLogin(login)
              _ <- logger.ftrace(s"Internal auth: Account lookup: $data")
              res <-
                data
                  .filter(check(up.pass))
                  .map(record => okResult(record.accountId(None)))
                  .getOrElse(LoginResult.invalidAuth.pure[F])
            } yield res
          case Left(_) =>
            logger.fdebug(s"Internal auth: failed.") *>
              LoginResult.invalidAuth.pure[F]
        }
      )
    )

  def withPosition: (Int, LoginModule[F]) = (cfg.internal.order, login)

  private def check(given: Password)(data: RAccount): Boolean = {
    val userOk = data.state == AccountState.Active
    val passOk = PasswordCrypt.check(given, data.password)
    userOk && passOk
  }
}

object InternalAuth {

  def apply[F[_]: Async](cfg: AuthConfig, oacc: OAccount[F]): InternalAuth[F] =
    new InternalAuth[F](cfg, oacc)
}
