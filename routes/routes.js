var bodyParser = require("body-parser");
var child_process = require("child_process");
var oPublishToFacebook = require("../publishToFacebook");
var suggest = require("../suggest");
var oScheduleChecker = require("../scheduleChecker");
var Request = require("request");
var oPdfCreator = require("../lib/pdfCreator");

// -- github operations
const oGithubApi = require("../lib/githubApi");

const DEFAULT_MIN_FACEBOOK_REPUBLISH_SECS = 900000;

var lastFacebookPublishDate = 0;

function getEnv() {
    var oEnv = { };
    [
        "FACEBOOK_PERMANENT_ACCESS_TOKEN",
        "SUNDAY_SCHEDULE_COMPLETED_WEBHOOK_URL",
        "SUNDAY_SCHEDULE_ERROR_WEBHOOK_URL",
        "SUNDAY_SCHEDULE_MOMENTS",
        "GOOGLE_SHEETS_SPREADSHEET_ID",
        "GOOGLE_SHEETS_OFFLINE_ACCESS_TOKEN_JSON",
        "GOOGLE_SHEETS_CREDENTIALS_JSON",
        "PASSWORD_AUTOMATIC_EMAILS",
        "FACEBOOK_IS_REAL_PUBLISH",
        "PASSWORD_BULLETIN_PUBLISH",
        "MIN_FACEBOOK_REPUBLISH_SECS",
        "PASSWORD_SONG_PUBLISH",
        "GITHUB_API_BASIC_AUTH",
        "ALLOWED_HOST",
        "DRY_RUN",
        "GITHUB_COMMITTER_NAME",
        "GITHUB_COMMITTER_EMAIL",
        "BULLETIN_FORK_FACEBOOK_PUBLISH",
        "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD",
        "PUPPETEER_EXECUTABLE_PATH"
    ].forEach((sVar) => {
        if (process.env[sVar]) {
            oEnv[sVar] = process.env[sVar];
        }
    });

    if (Object.keys(oEnv).length === 0) {
        throw new Error("Cannot determine API environment.");
    }

    return oEnv;
}

function validatePassword (sCorrectPassword, request, response) {
    var oData = request.body;

    if (oData.password !== sCorrectPassword) {
        response.send({
            success: false,
            message: "Invalid password"
        });
        return;
    }

    /* eslint-disable prefer-reflect*/
    delete oData.password; /* Important */
    /* eslint-enable */

    return oData;
}


var appRouter = function (app) {
    var oEnv = getEnv();
    var oStatus = {
        bulletin: {
            facebook: "success"
        }
    };

    var oGithubApiOptions = {
        committerName: oEnv.GITHUB_COMMITTER_NAME,
        committerEmail: oEnv.GITHUB_COMMITTER_EMAIL,
        apiBasicAuth: oEnv.GITHUB_API_BASIC_AUTH,
        isDryRun: oEnv.DRY_RUN === "true"
    };
    var newGithubFile = oGithubApi.newGithubFile.bind(null, oGithubApiOptions);
    var getGithubFile = oGithubApi.getGithubFile.bind(null, oGithubApiOptions);
    var triggerGithubPagesBuild = oGithubApi.triggerGithubPagesBuild.bind(null, oGithubApiOptions);

    var fnCreatePdfBuffer = oPdfCreator.createBuffer.bind(null, oEnv);

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: true
    }));
    app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", oEnv.ALLOWED_HOST);
      res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
      next();
    });
    // app.post("/ls", (request, response) => {
    //     const oData = validatePassword(oEnv.PASSWORD_BULLETIN_PUBLISH, request, response);
    //     if (!oData) {
    //         return;
    //     }
    //     const fs = require("fs");
    //     fs.readdir(oData.dir, (err, files) => {
    //         response.send({
    //             success: true,
    //             files
    //         });
    //     });

    // });
    app.get("/bulletin-list", (request, response) => {
        response.send({
            success: true,
            files: []
        });
    });
    app.get("/ping", (request, response) => {
        response.send({
            success: true,
            message: "PONG"
        });
    });
    app.get("/status", (request, response) => {
        response.send(oStatus);
    });

    app.post("/pdf", (request, response) => {
        function sendBuffer (data, filename, mimetype, res) {
            res.writeHead(200, {
                'Content-Type': mimetype,
                'Content-disposition': 'attachment;filename=' + filename,
                'Content-Length': data.length
            });
            res.end(Buffer.from(data, "binary"));
        }

        (async () => {

            const oData = validatePassword(oEnv.PASSWORD_BULLETIN_PUBLISH, request, response);
            if (!oData) {
                return;
            }

            try {
                console.log("Creating PDF");
                const sUrl = oData.url;
                const oPdfBuffer = await fnCreatePdfBuffer(sUrl);

                console.log("Sendin binary buffer");
                sendBuffer(oPdfBuffer, "bulletin.pdf", "application/pdf", response);
            } catch (sError) {
                console.log("Error while creating PDF (error):", sError);
                console.log("Error while creating PDF (stack):\n", sError.stack);
                response.send({
                    success: false,
                    error: sError
                });
            }
        })();

    });

    app.get("/abortFacebookPublish", (request, response) => {
        oPublishToFacebook.abort((sStatus) => {
            oStatus.bulletin.facebook = sStatus;
        });
        response.send(oStatus);
    });

    app.post("/mass-registration", (request, response) => {
        var oData = request.body;
        var sName = oData.name;
        var sNumberOfPeople = oData.number;

        response.send({
            success: true
        });
    });

    app.post("/icch-schedule-check", (request, response) => {
        var oData = request.body;
        if (oData.password !== oEnv.PASSWORD_AUTOMATIC_EMAILS) {
            response.send({
                success: false,
                message: "Invalid password"
            });
            return;
        }

        oScheduleChecker.triggerWebhook({
            dryRun: oEnv.DRY_RUN === "true",
            sundayScheduleCompletedWebhookURL: oEnv.SUNDAY_SCHEDULE_COMPLETED_WEBHOOK_URL,
            spreadsheetId: oEnv.GOOGLE_SHEETS_SPREADSHEET_ID,
            authorization: {
                format: "inline", /* inline | file */
                credentials: oEnv.GOOGLE_SHEETS_CREDENTIALS_JSON,
                accessToken: oEnv.GOOGLE_SHEETS_OFFLINE_ACCESS_TOKEN_JSON
            },
            ranges: {
                quartersInSpreadsheet: [
                    "1st quarter",
                    "2nd quarter",
                    "3rd quarter",
                    "4th quarter"
                ],
                wholeDataRange: "A1:H50"
            },
            fieldNames: (oEnv.SUNDAY_SCHEDULE_MOMENTS || "set-up,pick-up,priest,lector,em").split(",")
        }).then((/* oStatus */) => {
            response.send({
                success: true
            });
        }, (oCustomError) => {

            // notify via service as well
            Request.post(
                oEnv.SUNDAY_SCHEDULE_ERROR_WEBHOOK_URL,
                {
                    json: {
                        value1: oCustomError.message + "<br /> Stack:" + oCustomError.stack
                    }
                },
                (error, response, body) => {
                    if (!error && response.statusCode === 200) {
                        console.log("Got successful response from service after calling failure webhook: " + body);
                        return;
                    }
                    console.log("Failed to call failure webhook: " + error);
                }
            );

            response.send({
                success: false,
                message: oCustomError.message
            });
        });
    });

    app.post("/songs", (request, response) => {
        var oData = validatePassword(oEnv.PASSWORD_SONG_PUBLISH, request, response);
        if (!oData) {
            return;
        }

        if (oData.type === "suggestions") {

            suggest.getSuggestions().then((oSuggestions) => {
                response.send({
                    success: true,
                    result: oSuggestions
                });

            }, (error) => {
                response.send({
                    success: false,
                    message: "Cannot get suggestions"
                });
            });

            return;
        }

        if (oData.type === "save") {
            var sJsonFileName = oData.saveAs;

            delete oData.saveAs;
            delete oData.type;

            var sSongsSource = JSON.stringify(oData, null, 3);

            var sGithubPath = [
                "/repos/icchd/songs/contents/save/",
                sJsonFileName
            ].join("");

            // first check if the file exists
            getGithubFile(sGithubPath).then((oResponse) => oResponse.sha, (sStatus) => null).then((sSha) => {
                console.log("Making file with sha " + sSha);
                newGithubFile(sSongsSource, sGithubPath, sSha).then(() => {   // prepare for markdown upload
                    response.send({
                        success: true,
                        message: "Songs saved"
                    });
                }).catch((sError) => {
                    response.send({
                        success: false,
                        message: sError
                    });
                });
            });
            return;
        }

        if (oData.type === "saveNewSong") {

            delete oData.type;

            var sGithubPath = [
                "/repos/icchd/songs/contents/",
                "songs.json"
            ].join("");

            // first check if the file exists
            getGithubFile(sGithubPath).then((oResponse) => {
                var sBase64EncodedFile = oResponse.content;
                var oJSON = JSON.parse(Buffer.from(oResponse.content, oResponse.encoding));
                return {
                    sha: oResponse.sha,
                    json: oJSON
                };
            }, (sStatus) => null).then((oJSONAndSha) => {
                var sSha = oJSONAndSha.sha;
                var oSongs = oJSONAndSha.json;
                oSongs.list.push(oData);
                var sSongs = JSON.stringify(oSongs, null, 3);
                console.log("Making file with sha " + sSha);
                newGithubFile(sSongs, sGithubPath, sSha).then(() => {   // prepare for markdown upload
                    response.send({
                        success: true,
                        message: "New song added"
                    });
                }).catch((sError) => {
                    response.send({
                        success: false,
                        message: sError
                    });
                });
            });

            return;
        }

        response.send({
            success: false,
            message: "Invalid request type"
        });
    });
    app.post("/bulletin", (request, response) => {
        var oData = validatePassword(oEnv.PASSWORD_BULLETIN_PUBLISH, request, response);

        var sBullettinSource = JSON.stringify(oData, null, 3);

        var sJsonFileName = oData.saveAs.split(".");
        sJsonFileName.pop();
        sJsonFileName.push("json");
        sJsonFileName = sJsonFileName.join(".");

        var sGithubPath = [
            "/repos/icchd/bulletin/contents/archive/" + Math.floor(Date.now() / 1000),
            sJsonFileName
        ].join("-");

        var oCanPublishToFacebookPromise = new Promise((fnResolve) => {
            if (!oData.publish.icch) {
                fnResolve();
                return;
            }

            console.log("Publishing to ICCH");
            // first save as archive
            newGithubFile(sBullettinSource, sGithubPath).then(() => {   // prepare for markdown upload
                var sGithubPath = "/repos/icchd/icchd.github.io/contents/_bulletins/" + oData.saveAs;
                var sBullettin = [
                    "---",
                    "title: ICCH Bulletin of " + oData.date,
                    "date: " + oData.dateChanged,
                    "layout: post",
                    "---",
                    "",
                    "# " + oData.date + " " + oData.title,
                    "<span style=\"float: right\"><em>" + oData.father + "</em></span>",
                    "**Today's Readings:** " + oData.reading1 + " | " + oData.reading2 + " | " + oData.reading3,
                    "",
                    "",
                    oData.image.enabled ? "<img style=\"float: left; margin-right: 1em;\" src=\"" + oData.image.src + "\">" : "",
                    "",
                    oData.text,
                    "",
                    (oData.source && oData.source.indexOf("Source") === -1 ? "Source: " : "") + oData.source,
                    "",
                    oData.appointments.length ? "### News " : "",
                    "",
                    oData.appointments.map((o) => "* **" + o.date + "** - " + o.description).join("\n"),
                    ""
                ].join("\n");

                return newGithubFile(sBullettin, sGithubPath);
            }).then(() => {
                fnResolve();
            }).catch((sError) => {
                response.send({
                    success: false,
                    message: sError
                });
            });
        });

        var sGithubPagesPathBase = "/repos/icchd/icchd.github.io";
        oCanPublishToFacebookPromise
            .then(() => triggerGithubPagesBuild(sGithubPagesPathBase))
            .then(() => publishToFacebook(oData))
            .then((oResult) => {
                var oResponse = {};
                oResponse.success = oResult.status !== "error";
                oResponse.message = oResult.message;
                oResponse.path = "/" + oData.saveAs;
            });
    });

    function publishToFacebook(oData) {
        // cancel previous operation if any is ongoing
        oPublishToFacebook.abort((progress) => {
            oStatus.bulletin.facebook = progress;
        });

        const sMinRepublishSecs = oEnv.MIN_FACEBOOK_REPUBLISH_SECS || DEFAULT_MIN_FACEBOOK_REPUBLISH_SECS;

        if (oData.publish.facebook) {
            var sSeconds = new Date().getTime() - lastFacebookPublishDate;
            if (sSeconds <= sMinRepublishSecs) {
                console.log("Cannot publish to facebook yet. Must wait until " +
                    sSeconds + "/" + sMinRepublishSecs + " seconds before retrying.");

                oStatus.bulletin.facebook = "retry in " + (parseInt(sMinRepublishSecs, 10) - parseInt(sSeconds, 10)) + " seconds";

                return {
                    status: "error",
                    message: "Please wait 15 minutes before re-publishing"
                };
            }

            lastFacebookPublishDate = new Date().getTime();

            oStatus.bulletin.facebook = "beginning";

            var oPublishOpts = {
                publishForReal: oEnv.FACEBOOK_IS_REAL_PUBLISH === "true",
                accessToken: oEnv.FACEBOOK_PERMANENT_ACCESS_TOKEN,
                message: oData.publish.facebookMessage || "Our bulletin for " + oData.title + " is available",
                link: oData.publish.htmlLink
            };

            if (oEnv.BULLETIN_FORK_FACEBOOK_PUBLISH === "true") {
                var child = child_process.fork("./publishToFacebook");
                child.send(oPublishOpts);
                child.on("error", (err) => {
                    console.log("Error from child process: " + err);
                });
                oStatus.bulletin.facebook = "success";
                return {
                    status: "success", // caller must check the status
                    message: "Process is taking care of publishing"
                };
            }
                oPublishToFacebook.beginPublish(oPublishOpts, (progress) => {
                    oStatus.bulletin.facebook = progress;
                }).then(() => {
                    console.log("Publish to facebook done");
                }, (e) => {
                    console.log("Publish to facebook error");
                    console.log(e);
                });

                return {
                    status: "progress", // caller must check the status
                    message: "Bulletin is being published on facebook"
                };

        }
    }
};

module.exports = appRouter;
