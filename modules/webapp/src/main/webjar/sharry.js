/* Sharry JS */
function forEachIn(obj, fn) {
    var index = 0;
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            fn(obj[key], key, index++);
        }
    }
}

function extend() {
    var result = {};
    for (var i = 0; i < arguments.length; i++) {
        forEachIn(arguments[i],
            function(obj, key) {
                result[key] = obj;
            });
    }
    return result;
}

function applyUiTheme(themeName) {
    var body = document.getElementsByTagName("body");
    if (themeName && body && body.length > 0) {
        var bodyClasses = body[0].classList;
        // seems that body attributes cannot be set from inside Elm.
        if (themeName.toLowerCase() === 'dark') {
            bodyClasses.add("bg-warmgray-800");
            bodyClasses.add("dark");
        } else {
            bodyClasses.remove("bg-warmgray-800");
            bodyClasses.remove("dark");
        }
    }
}


var elmApp = Elm.Main.init({
    node: document.getElementById("sharry-app"),
    flags: elmFlags
});

elmApp.ports.setLanguage.subscribe(function(lang) {
    localStorage.setItem("language", lang);
    elmApp.ports.receiveLanguage.send(lang);
});

elmApp.ports.setAccount.subscribe(function(authResult) {
    localStorage.setItem("account", JSON.stringify(authResult));
});

elmApp.ports.removeAccount.subscribe(function() {
    localStorage.removeItem("account");
});

elmApp.ports.scrollTop.subscribe(function(data) {
    window.scrollTo(0, 0);
});

elmApp.ports.scrollToElem.subscribe(function(id) {
    if (id && id != "") {
        window.setTimeout(function() {
            var el = document.getElementById(id);
            if (el) {
                if (el["scrollIntoViewIfNeeded"]) {
                    el.scrollIntoViewIfNeeded();
                } else {
                    el.scrollIntoView();
                }
            }
        }, 0);
    }
});

var sharry_uploads = {};

elmApp.ports.submitFiles.subscribe(function(data) {
    var url = data.url;
    var files = data.files;
    var myHeaders = {};
    if (data.aliasId) {
        myHeaders["Sharry-Alias"] = data.aliasId;
    }

    var doUpload = function (index, file) {
        var upload = new tus.Upload(
            file,
            { endpoint: url,
              chunkSize: sharryFlags.chunkSize,
              retryDelays: sharryFlags.retryDelays,
              removeFingerprintOnSuccess: true,
              headers: extend(myHeaders, {
                  "Sharry-File-Name": encodeURIComponent(file.name),
                  "Sharry-File-Length": file.size,
                  "Sharry-File-Type": file.type
              }),
              onError: function(error) {
                  console.log("XX: " + error);
                  elmApp.ports.uploadState.send({
                      id: data.id,
                      file: index,
                      progress: {
                          state: "failed",
                          error: (error || "").toString()
                      }
                  });
              },
              onProgress: function(bytesUploaded, bytesTotal) {
                  elmApp.ports.uploadState.send({
                      id: data.id,
                      file: index,
                      progress: {
                          state: "progress",
                          uploaded: bytesUploaded,
                          total: bytesTotal
                      }
                  });
              },
              onChunkComplete: function(chunkSize, bytesUploaded, bytesTotal) {
                  elmApp.ports.uploadState.send({
                      id: data.id,
                      file: index,
                      progress: {
                          state: "progress",
                          uploaded: bytesUploaded,
                          total: bytesTotal
                      }
                  });
              },
              onSuccess: function() {
                  elmApp.ports.uploadState.send({
                      id: data.id,
                      file: index,
                      progress: {
                          state: "complete"
                      }
                  });
                  var next = index + 1;
                  if (next < files.length) {
                      doUpload(next, files[next]);
                  } else {
                      delete sharry_uploads[data.id];
                  }
              }
            });
        sharry_uploads[data.id] = upload;
        upload.start();
    };

    if (url && files && files.length > 0) {
        doUpload(0, files[0]);
    } else {
        console.log("No files to upload");
    }
});

elmApp.ports.stopUpload.subscribe(function(id) {
    var upload = sharry_uploads[id];
    if (upload) {
        upload.abort(false, function(error) {
            elmApp.ports.uploadStopped.send(error);
        });
        // The callback is not called by tus-js-client …
        elmApp.ports.uploadStopped.send(null);
    }
});

elmApp.ports.startUpload.subscribe(function(id) {
    var upload = sharry_uploads[id];
    if (upload) {
        upload.start();
    }
});


var sharry_clipboards = {};

elmApp.ports.initClipboard.subscribe(function(args) {
    var page = args[0];
    if (!sharry_clipboards[page]) {
        var sel = args[1];
        sharry_clipboards[page] = new ClipboardJS(sel);
    }
});

elmApp.ports.internalSetUiTheme.subscribe(function(themeName) {
    if (themeName) {
        localStorage.setItem("uiTheme", themeName);
        applyUiTheme(themeName);
    }
});


applyUiTheme(theme);
