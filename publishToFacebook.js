var FB = require("fb");
var request = require("request");
var retry = require("retry");

function checkPageExists(sUrl, cb) {
    var operation = retry.operation({
        retries: 20,
        factor: 8
    });

    operation.attempt( function(currentAttempt) {
        console.log("Facebook publishing attempt " + currentAttempt);

        request(sUrl, function (error, response, body) {
            if (operation.retry(error || !response || response.statusCode !== 200)) {
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
            '/InternationalCatholicCommunityofHeidelberg/feed',
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

process.on("message", function (oData) {
    checkPageExists(oData.link, function(err, sStatusCode) {
        if (err) {
            console.log("Error while publishing to facebook occurred");
            console.log(err);
            process.disconnect();
            return;
        }
        publishToFacebook(
          oData.accessToken,
          oData.message,
          oData.link,
          oData.publishForReal
        ).then(function (sUrl) {
          console.log("Facebook publishing success", sUrl);
        }, function () {
          console.log("Facebook publishing failed");
        }).then(function () {
            process.disconnect();
        });
    });
});
