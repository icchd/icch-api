const fnGetGoogleSpreadsheetAsJSON = require("./lib/spreadsheetReader");
const GoogleAuth = require("./lib/googleAuth");
const Request = require("request");

function validateInput (sName, sNumberOfPeople) {
    if (typeof sName !== "string" || sName.length === 0) {
        return "Empty name was provided. Please enter a name and try again";
    }
    if (typeof sNumberOfPeople !== "string" || !(/[1-9]0?/u).test(sNumberOfPeople)) {
        return "Invalid number was provided. Please enter a valid number and try again";
    }
    return null;
}

async function getAvailablePlaces (sSpreadsheetId, oAuthorizationConfig) {
    const oAuthorizationToken = await GoogleAuth.getGoogleAuthorization(oAuthorizationConfig);

    const aSpreadsheetValues = await fnGetGoogleSpreadsheetAsJSON(
        oAuthorizationToken,
        sSpreadsheetId,
        `covid!A1:A99999`,
        {
            headerRow: 1
        }
    );

    return Reflect.apply(Math.max, null, aSpreadsheetValues.map((o) => o.maxnumber));
}

async function registerName (oEnv, sName, sNumberOfPeople) {
    var iNumberOfPeople = parseInt(sNumberOfPeople, 10);
    var oAuthorizationConfig = {
        format: "inline", /* inline | file */
        credentials: oEnv.GOOGLE_SHEETS_CREDENTIALS_JSON,
        accessToken: oEnv.GOOGLE_SHEETS_OFFLINE_ACCESS_TOKEN_JSON
    };
    var iAvailablePlaces = await getAvailablePlaces(oEnv.GOOGLE_SHEETS_SPREADSHEET_ID, oAuthorizationConfig);
    if (iAvailablePlaces < 0) {
        return "Registration error. Please try again later.";
    }
    if (iAvailablePlaces < iNumberOfPeople) {
        return "Sorry, only " + iAvailablePlaces + " are available, so we cannot register " + iNumberOfPeople + " people.";
    }

    // proceed with registration: trigger webhook
    var oRegistrationPayload = {
        value1: "128",
        value2: "Name",
        value3: "SundayDate"
    };

    Request.post({
        url: "https://maker.ifttt.com/trigger/registerIcchAttendance/with/key/fiWhzPuGKRLEeVXuLflW9",
        body: oRegistrationPayload
    }, (error, response, body) => {
        if (!error && response.statusCode === 201) {
            console.log("Got successful response  " + body);
        }
        console.log("Failed to call API: " + error + " status was " + response.statusCode);
    });

    return null;
}

module.exports = {
    validateInput,
    getAvailablePlaces,
    registerName
};
