var bodyParser = require("body-parser");
var fs = require('fs');
var https = require("https");
var child_process = require("child_process");

// -- facebook publishing

const StringDecoder = require('string_decoder').StringDecoder;
const decoder = new StringDecoder('utf8');
const MIN_FACEBOOK_REPUBLISH_SECS = 900000;

var lastFacebookPublishDate = 0;

function getEnv() {
    var oEnv = { };
    [
        "FACEBOOK_PERMANENT_ACCESS_TOKEN",
        "FACEBOOK_IS_REAL_PUBLISH",
        "PASSWORD_BULLETIN_PUBLISH",
        "PASSWORD_SONG_PUBLISH",
        "GITHUB_API_BASIC_AUTH",
        "ALLOWED_HOST",
        "DRY_RUN",
        "GITHUB_COMMITTER_NAME",
        "GITHUB_COMMITTER_EMAIL",
        "BULLETIN_FORK_FACEBOOK_PUBLISH"
    ].forEach(function (sVar) {
        if (process.env[sVar]) {
            oEnv[sVar] = process.env[sVar];
        }
    });

    if (Object.keys(oEnv).length === 0) {
        throw new Error("Cannot determine API environment.");
    }

    return oEnv;
}


function getGithubFile(sGithubPath) {
    return new Promise(function (fnResolve, fnReject) {
        https.get({
            host: 'api.github.com',
            path: sGithubPath,
            headers: {
                "User-agent": "Songs App"
            }
        }, function (response) {

            // Continuously update stream with data
            var body = '';
            response.on('data', function(d) {
                body += d;
            });
            response.on('end', function() {
                console.log(response.statusCode + " " + body);

                // Data reception is done, do whatever with it!
                try {
                    var parsed = JSON.parse(body);
                    console.log(parsed);
                    fnResolve(parsed);
                } catch (e) {
                    console.log(e);
                    fnReject();
                }
            });
        }).on('error', function (e) {
            fnReject();
        });
    });
}

function newGithubFile(sContent, sGithubPath, sSha) {
    return new Promise(function (fnResolve, fnReject) {

        var oEnv = getEnv();

        var sPostData,
            oPostData,
            sContentBase64;

        try {
            sContentBase64 = (new Buffer(sContent)).toString("base64");

            oPostData = {
                "message": "Upload " + sGithubPath.split("/").reverse()[0],
                "committer": { "name": oEnv.GITHUB_COMMITTER_NAME, "email": oEnv.GITHUB_COMMITTER_EMAIL },
                "content": sContentBase64,
            };
            if (sSha) {
                oPostData.sha = sSha;
            }

            sPostData = JSON.stringify(oPostData);
        } catch (oErr) {
            console.log("ERROR:" + oErr);
            fnReject("Unexpected error occurred while parsing POST data");
            return;
        }

        try {
            var sResponse = "";
            var oRequestData = {
                host: 'api.github.com',
                port: 443,
                path: sGithubPath,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(sPostData),
                    'Accept': 'application/vnd.github.v3+json',
                    'Authorization': 'Basic ' + oEnv.GITHUB_API_BASIC_AUTH,
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.87 Safari/537.36'
                }
            };

            console.log("DRY_RUN: " + oEnv.DRY_RUN);
            if (oEnv.DRY_RUN === "true") {
                console.log("dry run: sending post request to api.github.com");
                fnResolve();
                return;
            }

            var oPostRequest = https.request(oRequestData, function(res) {
                res.setEncoding('utf8');
                if (res.statusCode === 200 || res.statusCode === 201) {
                    fnResolve();
                } else {
                    fnReject("Request failed with status " + res.statusCode);
                }
                res.on('data', function (chunk) {
                    console.log('BODY: ' + chunk);
                });
            });

            oPostRequest.write(sPostData);
            oPostRequest.end();
        } catch (oErr) {
            console.log("ERROR:" + oErr);
            fnReject("Unexpected error occurred while saving to " + sGithubPath);
        }

    });
}

var appRouter = function (app) {
    var oEnv = getEnv();
    var oStatus = {
        bulletin: {}
    };

    app.use( bodyParser.json() );
    app.use( bodyParser.urlencoded({
        extended: true
    }));
    app.use(function(req, res, next) {
      res.header('Access-Control-Allow-Origin', oEnv.ALLOWED_HOST);
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
      next();
    });
    app.get("/bulletin-list", function (request, response) {
        response.send({
            success: true,
            files: []
        })
    });
    app.get("/ping", function (request, response) {
        response.send({
            success: true,
            message: "PONG"
        });
    });
    app.get("/status", function (request, response) {
        response.send(oStatus);
    });

    app.post("/songs", function (request, response) {
        var oData = request.body;

        if (oData.password !== oEnv.PASSWORD_SONG_PUBLISH) {
            response.send({
                success: false,
                message: "Invalid password"
            });
            return;
        }

        var sJsonFileName = oData.saveAs;

        delete oData.password; /* Important */
        delete oData.saveAs;

        var sSongsSource = JSON.stringify(oData, null, 3);

        var sGithubPath = [
            "/repos/icchd/songs/contents/save/",
            sJsonFileName
        ].join("");

        // first check if the file exists
        getGithubFile(sGithubPath).then(function (oResponse) {
            return oResponse.sha;
        }, function (sStatus) {
            return null;
        }).then(function (sSha) {
            console.log("Making file with sha " + sSha);
            newGithubFile(sSongsSource, sGithubPath, sSha).then(function () {   // prepare for markdown upload
                response.send({
                    success: true,
                    message: "Songs saved"
                });
            }).catch(function (sError) {
                response.send({
                    success: false,
                    message: sError
                });
            });
        });
    });
    app.post("/bulletin", function (request, response) {
        var oData = request.body;

        if (oData.password !== oEnv.PASSWORD_BULLETIN_PUBLISH) {
            response.send({
                success: false,
                message: "Invalid password"
            });
            return;
        }

        delete oData.password; /* Important */

        var sBullettinSource = JSON.stringify(oData, null, 3);

        var sJsonFileName = oData.saveAs.split(".");
        sJsonFileName.pop();
        sJsonFileName.push("json");
        sJsonFileName = sJsonFileName.join(".");

        var sGithubPath = [
            "/repos/icchd/bulletin/contents/archive/" + Math.floor(Date.now() / 1000),
            sJsonFileName
        ].join("-");

        var oCanPublishToFacebookPromise = new Promise(function (fnResolve) {
            if (!oData.publish.icch) {
                fnResolve();
                return;
            }

            console.log("Publishing to ICCH");
            // first save as archive
            newGithubFile(sBullettinSource, sGithubPath).then(function () {   // prepare for markdown upload
                var sGithubPath = '/repos/icchd/icchd.github.io/contents/_bulletins/' + oData.saveAs;
                var sBullettin = [
                    '---',
                    'title: ICCH Bulletin of ' + oData.date,
                    'date: ' + oData.dateChanged,
                    'layout: post',
                    '---',
                    '',
                    '# ' + oData.date + " " + oData.title,
                    '<span style="float: right"><em>' + oData.father + '</em></span>',
                    '**Today\'s Readings:** ' + oData.reading1 + " | " + oData.reading2 + " | " + oData.reading3,
                    '',
                    '',
                    oData.image.enabled ? '<img style="float: left; margin-right: 1em;" src="' + oData.image.src + '">' : "",
                    '',
                    oData.text,
                    '',
                    (oData.source && oData.source.indexOf("Source") === -1 ? 'Source: ' : "") + oData.source,
                    '',
                    oData.appointments.length ? '### News ' : "",
                    '',
                    oData.appointments.map(function (o) { return "* **" + o.date + "** - " + o.description }).join("\n"),
                    ''
                ].join("\n");

                return newGithubFile(sBullettin, sGithubPath);
            }).then(function () {
                fnResolve();
            }).catch(function (sError) {
                response.send({
                    success: false,
                    message: sError
                });
            });
        });

        oCanPublishToFacebookPromise.then(function () {
            publishToFacebook(oData);
        }).then(function (oResult) {
            var oResponse = {};
            oResponse.success = oResult.status === "error" ? false : true;
            oResponse.message = oResult.message;
            oResponse.path = "/" + oData.saveAs;
        });
    });

    function publishToFacebook(oData) {
        if (oData.publish.facebook) {
            var sSeconds = new Date().getTime() - lastFacebookPublishDate;
            if (sSeconds <= MIN_FACEBOOK_REPUBLISH_SECS) {
                console.log("Cannot publish to facebook yet. Must wait until "
                    + sSeconds + "/" + MIN_FACEBOOK_REPUBLISH_SECS + " seconds before retrying.");

                return {
                    status: "error",
                    message: "Please wait 15 minutes before re-publishing"
                };
            }

            lastFacebookPublishDate = new Date().getTime();

            oStatus.bulletin.facebook = "beginning";

            var oPublishOpts = {
                publishForReal: oEnv.FACEBOOK_IS_REAL_PUBLISH === "true" ? true : false,
                accessToken: oEnv.FACEBOOK_PERMANENT_ACCESS_TOKEN,
                message: oData.publish.facebookMessage || "Our bulletin for " + oData.title + " is available",
                link: oData.publish.htmlLink
            };

            if (oEnv.BULLETIN_FORK_FACEBOOK_PUBLISH === "true") {
                var child = child_process.fork("./publishToFacebook");
                child.send(oPublishOpts);
                child.on("error", function (err) {
                    console.log("Error from child process: " + err);
                });
                oStatus.bulletin.facebook = "success";
            } else {
                var oPublishToFacebook = require("../publishToFacebook");
                oPublishToFacebook.beginPublish(oPublishOpts, function (progress) {
                    oStatus.bulletin.facebook = progress;
                });
                return {
                    status: "progress", // caller must check the status
                    message: "Bulletin is being published on facebook"
                };
            }
        }
    }
};

module.exports = appRouter;
