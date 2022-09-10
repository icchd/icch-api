var FB = require("fb");
var request = require("request");
var retry = require("retry");

var operation = null;

function abort (fnStatusUpdate) {
    if (operation) {
        operation.stop();
        fnStatusUpdate("aborted");
    }
}

function checkPageExists(sUrl, cb, fnStatusUpdate) {
    operation = retry.operation({
        retries: 20,
        factor: 8
    });

    operation.attempt( function(currentAttempt) {
        console.log("Facebook publishing attempt " + currentAttempt);
        fnStatusUpdate("waiting " + currentAttempt + "/20");

        request(sUrl, function (error, response, body) {
            if (!operation || operation.retry(error || !response || response.statusCode !== 200)) {
              return;
            }
            cb();
        });
    });
}
function publishToFacebook(sPermanentAccessToken, sMessage, sLink, isRealPublish) {
    return new Promise(function (fnResolve, fnReject) {

        FB.setAccessToken(sPermanentAccessToken);

        FB.api(
            '/470231359761256/feed',
            'post', {
                // API: https://developers.facebook.com/docs/graph-api/reference/v2.10/page/feed
                // message: 'Our bulletin for ' + app.bulletin.title + ' is available',
                message: sMessage,
                link: sLink,
                published: isRealPublish
            }, function (oRes) {
                if (oRes.error) {
                    fnReject(oRes.error);
                    return;
                }

                var sId = oRes.id;
                var aId = sId.split("_");
                var sPageId = aId[0];
                var sPostId = aId[1];
                fnResolve(`https://www.facebook.com/${sPageId}/posts/${sPostId}`);
            }
        );
    });
}

function beginPublish(oData, fnStatusCb) {
    var fnProgressUpdate = fnStatusCb || function () { };

    return new Promise(function (fnSuccess, fnError) {
        checkPageExists(oData.link, function(err, sStatusCode) {
            if (err) {
                fnProgressUpdate("error");
                fnError(err);
                return;
            }
            fnProgressUpdate("publishing");
            publishToFacebook(
              oData.accessToken,
              oData.message,
              oData.link,
              oData.publishForReal
            ).then(function (sUrl) {
              fnProgressUpdate("success");
              fnSuccess(sUrl);
            }, function (e) {
              fnProgressUpdate("error");
              fnError(e);
            })
        }, fnProgressUpdate);
    });
}

if (process) {
    process.on("message", function (oData) {
        beginPublish(oData)
            .then(function (sUrl) {
                console.log("Facebook publishing success", sUrl);
                process.disconnect();
            }, function (err) {
                console.log("Error while publishing to facebook occurred");
                console.log(err);
                process.disconnect();
            });
    });
}

module.exports = {
    beginPublish,
    abort
}

