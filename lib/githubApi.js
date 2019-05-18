var https = require("https");

function getGithubFile(oOptions, sGithubPath) {

    return new Promise((fnResolve, fnReject) => {
        https.get({
            host: "api.github.com",
            path: sGithubPath,
            headers: {
                "User-agent": "Songs App"
            }
        }, (response) => {

            // Continuously update stream with data
            var body = "";
            response.on("data", (sData) => {
                body += sData;
            });
            response.on("end", () => {
                try {
                    const parsed = JSON.parse(body);
                    fnResolve(parsed);
                } catch (oError) {
                    fnReject(oError);
                }
            });
        }).on("error", (oError) => {
            fnReject(oError);
        });
    });
}

function newGithubFile (oOptions, sContent, sGithubPath, sSha) {
    const {
        committerName,  // oEnv.GITHUB_COMMITTER_NAME
        committerEmail, // oEnv.GITHUB_COMMITTER_EMAIL 
        apiBasicAuth,   // oEnv.GITHUB_API_BASIC_AUTH
        isDryRun        // oEnv.DRY_RUN
    } = oOptions;

    return new Promise((fnResolve, fnReject) => {
        const sRequestBody = _prepareGithubRequestBody(sContent, sGithubPath, committerName, committerEmail, sSha);
        const oRequestData = _prepareGithubRequestData(sGithubPath, sRequestBody, apiBasicAuth);

        if (isDryRun) {
            console.log("dry run: sending post request to api.github.com");
            fnResolve();
            return;
        }

        _sendGithubRequest(oRequestData, sRequestBody).then(
            fnResolve, 
            (oErr) => {
                console.log("ERROR:" + oErr);
                fnReject(new Error("Unexpected error occurred while saving to " + sGithubPath));
            }
        );
    });
}

function _prepareGithubRequestBody (sContent, sGithubPath, sCommitterName, sCommitterEmail, sSha) {
    try {
        const sContentBase64 = Buffer.from(sContent).toString("base64");

        const oPostData = {
            "message": "Upload " + sGithubPath.split("/").reverse()[0],
            "committer": {
                "name": sCommitterName,
                "email": sCommitterEmail
            },
            "content": sContentBase64,
        };

        if (sSha) {
            oPostData.sha = sSha;
        }

        return JSON.stringify(oPostData);
    } catch (oErr) {
        console.log("ERROR:" + oErr);
        throw new Error("Unexpected error occurred while parsing POST data");
    }
}

function _prepareGithubRequestData (sGithubPath, sPostData, apiBasicAuth) {
    const oRequestData = {
        host: "api.github.com",
        port: 443,
        path: sGithubPath,
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(sPostData),
            "Accept": "application/vnd.github.v3+json",
            "Authorization": `Basic ${apiBasicAuth}`,
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.87 Safari/537.36"
        }
    };
    return oRequestData;
}

function _sendGithubRequest (oRequestData, sRequestBody) {
    return new Promise((fnResolve, fnReject) => {
        const oRequest = https.request(oRequestData, (res) => {
            res.setEncoding("utf8");
            if (res.statusCode === 200 || res.statusCode === 201) {
                fnResolve();
            } else {
                fnReject(new Error("Request failed with status " + res.statusCode));
            }
            res.on("data", (chunk) => {
                console.log("BODY: " + chunk);
            });
        });

        oRequest.write(sRequestBody);
        oRequest.end();
    });
}


module.exports = {
    getGithubFile,
    newGithubFile
};