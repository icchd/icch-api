const fs = require("fs");
const {google} = require("googleapis");
const readline = require("readline");

async function readFile (sFileName) {
    return new Promise((fnSuccess, fnReject) => {
        fs.readFile(sFileName, (sErr, sContent) => {
            if (sErr) {
                return fnReject(sErr);
            }

            return fnSuccess(sContent);
        });
    });
}

async function loadClientSecrets (sCredentialsFile) {
    const sText = await readFile(sCredentialsFile);

    return JSON.parse(sText);
}
async function loadClientToken (sTokenFile) {
    const sText = await readFile(sTokenFile);

    return JSON.parse(sText);
}

async function getGoogleAuthorization({
    format: sAuthorizationFormat,
    credentials: sCredentials,
    accessToken: sAccessToken
}) {
    const oCredentials = sAuthorizationFormat === "inline"
        ? JSON.parse(sCredentials)
        : await loadClientSecrets(sCredentials);

    const oToken = sAuthorizationFormat === "inline"
        ? JSON.parse(sAccessToken)
        : await loadClientToken(sAccessToken);
    const oAuthorization = authorize(oCredentials, oToken);

    return oAuthorization;
}

function authorize (oCredentials, oToken) {
    const {
        client_secret,
        client_id,
        redirect_uris
    } = oCredentials.installed;

    const oAuth = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    oAuth.setCredentials(oToken);

    return oAuth;
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function generateNewToken (oAuth2Client, sTokenPath) {
  const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

  /* eslint-disable no-console */
  return new Promise((fnResolve) => {

      // If modifying these scopes, delete token.json.
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
      });
      console.log("Authorize this app by visiting this url:", authUrl);
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question("Enter the code from that page here: ", (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
          if (err) return console.error("Error while trying to retrieve access token", err);
          oAuth2Client.setCredentials(token);
          // Store the token to disk for later program executions
          fs.writeFile(sTokenPath, JSON.stringify(token), (err) => {
            if (err) return console.error(err);
            console.log("Token stored to", sTokenPath);
          });
          fnResolve(oAuth2Client);
        });
      });
  });
}

module.exports = {
    getGoogleAuthorization,
    generateNewToken
};
