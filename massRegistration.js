const fnGetGoogleSpreadsheetAsJSON = require("./lib/spreadsheetReader");
const GoogleAuth = require("./lib/googleAuth");
const Request = require("request");
const moment = require("moment");

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

    return Reflect.apply(Math.min, null, aSpreadsheetValues.map((o) => o.maxnumber));
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
        return "Sorry, only " + iAvailablePlaces + " places are available, so we cannot register " + iNumberOfPeople + " people.";
    }

    return new Promise((fnResolve) => {
        const oNextSunday = moment().weekday(7);

        var oRegistrationPayload = {
            value1: sNumberOfPeople,
            value2: sName,
            value3: oNextSunday.format("ll")
        };

        Request.post("https://maker.ifttt.com/trigger/registerIcchAttendance/with/key/fiWhzPuGKRLEeVXuLflW9", {
            json: oRegistrationPayload
        }, (error, response, body) => {
            if (error) {
                console.log("Failed to call API: " + error + " status was " + response.statusCode);
                fnResolve("An error occurred while registering your name");
            } else {
                console.log("Got successful response  " + body);
                fnResolve(null);
            }
        });
    });
}

module.exports = {
    validateInput,
    getAvailablePlaces,
    registerName
};
