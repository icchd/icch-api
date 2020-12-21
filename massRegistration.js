const fnGetGoogleSpreadsheetAsJSON = require("./lib/spreadsheetReader");
const SpreadsheetWriter = require("./lib/spreadsheetWriter");
const GoogleAuth = require("./lib/googleAuth");
const Request = require("request");
const moment = require("moment-timezone");

function m () {
    return moment().tz("Europe/Berlin");
}

function validateInput (sName, sNumberOfPeople) {
    if (typeof sName !== "string" || sName.length === 0) {
        return "Empty name was provided. Please enter a name and try again";
    }

    if (!(/^[\w \u00F0-\u02AF-]+$/u).test(sName)) {
        return "You have provided an invalid name. You can use only letters and space or dash (\"-\") Characters.";
    }

    if (typeof sNumberOfPeople !== "string" || !(/^[1-9]0?$/u).test(sNumberOfPeople)) {
        return "Invalid number was provided. Please enter a valid number between 1 and 10, and try again.";
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

async function getRegistrationStatusWish (sSpreadsheetId, oAuthorizationConfig) {
    const oAuthorizationToken = await GoogleAuth.getGoogleAuthorization(oAuthorizationConfig);

    const aSpreadsheetValues = await fnGetGoogleSpreadsheetAsJSON(
        oAuthorizationToken,
        sSpreadsheetId,
        `covid!C1:C2`,
        {
            headerRow: 1
        }
    );

    return aSpreadsheetValues.map((o) => o.statuswish)[0];
}

async function getRegistrationStatus (sSpreadsheetId, oAuthorizationConfig) {
    const oAuthorizationToken = await GoogleAuth.getGoogleAuthorization(oAuthorizationConfig);

    const aSpreadsheetValues = await fnGetGoogleSpreadsheetAsJSON(
        oAuthorizationToken,
        sSpreadsheetId,
        `covid!B1:B2`,
        {
            headerRow: 1
        }
    );

    return aSpreadsheetValues.map((o) => o.status)[0];
}

async function updateSheetCell (sCellId, sValue, sSheetName, sWorksheetName, oAuthorizationConfig) {
    const oAuthorizationToken = await GoogleAuth.getGoogleAuthorization(oAuthorizationConfig);
    await SpreadsheetWriter.update(
        oAuthorizationToken,
        sSheetName,
        `${sWorksheetName}!${sCellId}`,
        {
            value: String(sValue)
        }
    );
}

async function updateRemainingSeats (iNumber, sSpreadsheetId, oAuthorizationConfig) {
    await updateSheetCell("A2", String(iNumber), sSpreadsheetId, "covid", oAuthorizationConfig);
}

async function registerName (oEnv, sName, sNumberOfPeople) {
    var iNumberOfPeople = parseInt(sNumberOfPeople, 10);
    var oAuthorizationConfig = createAuthorizationConfig(oEnv);
    var iAvailablePlaces = await getAvailablePlaces(oEnv.GOOGLE_SHEETS_COVID_SEATCOUNT_SPREADSHEET_ID, oAuthorizationConfig);
    if (iAvailablePlaces < 0) {
        return {
            success: false,
            message: "Registration error. Please try again later."
        };
    }
    if (iAvailablePlaces === 0) {
        return {
            success: false,
            message: "Sorry, there are no more places available."
        };
    }
    if (iAvailablePlaces < iNumberOfPeople) {
        return {
            success: false,
            message: "Sorry, only " + iAvailablePlaces + " places are available, so we cannot register " + iNumberOfPeople + " people."
        };
    }

    await updateRemainingSeats(iAvailablePlaces - iNumberOfPeople, oEnv.GOOGLE_SHEETS_COVID_SEATCOUNT_SPREADSHEET_ID, oAuthorizationConfig);

    return new Promise((fnResolve) => {
        const oNextSunday = getNextMassDay(oEnv);

        Request.post(oEnv.IFTTT_COVID_SEAT_WEBHOOK_URL, {
            json: {
                value1: sNumberOfPeople,
                value2: sName,
                value3: oNextSunday.format("ll")
            }
        }, (error, response, body) => {
            if (error) {
                console.log("Failed to call API: " + error + " status was " + response.statusCode);
                fnResolve({
                    success: false,
                    message: "An error occurred while registering your name"
                });
            } else {
                console.log("Got successful response  " + body);
                fnResolve({
                    success: true,
                    message: "Thank you. See you at mass on " + oNextSunday.format("ll") + "! Do not forget to mention the name '" + sName + "' to our volunteers when arriving."
                });
            }
        });
    });
}

function getNextMassDay(oEnv) {
    const sMassDay = oEnv.COVID_REGISTRATION_MASS_DAY_DDMMYYYY;
    if (sMassDay) {
        return m(sMassDay, "DDMMYYYY");
    }

    let oNextSunday = m().weekday(7);
    if (m().format('dddd') === "Sunday" && parseInt(m().format('H'), 10) <= 10) {
        oNextSunday = m();
    }
    return oNextSunday;
}

function createAuthorizationConfig (oEnv) {
    return {
        format: "inline", /* inline | file */
        credentials: oEnv.GOOGLE_SHEETS_CREDENTIALS_JSON,
        accessToken: oEnv.GOOGLE_SHEETS_OFFLINE_ACCESS_TOKEN_JSON
    };
}

async function checkAvailability (oEnv) {
    var oNextSunday = getNextMassDay(oEnv);
    var oAuthorizationConfig = createAuthorizationConfig(oEnv);
    var iAvailablePlaces = await getAvailablePlaces(oEnv.GOOGLE_SHEETS_COVID_SEATCOUNT_SPREADSHEET_ID, oAuthorizationConfig);
    var sStatus = await getRegistrationStatus(oEnv.GOOGLE_SHEETS_COVID_SEATCOUNT_SPREADSHEET_ID, oAuthorizationConfig);

    return {
        number: iAvailablePlaces,
        date: oNextSunday.format("ll"),
        status: sStatus
    };
}

async function openMassRegistration (oEnv) {
    var oAuthorizationConfig = createAuthorizationConfig(oEnv);
    var sWish = await getRegistrationStatusWish(oEnv.GOOGLE_SHEETS_COVID_SEATCOUNT_SPREADSHEET_ID, oAuthorizationConfig);

    var sResult = null;

    try {
        var sSpreadsheetId = oEnv.GOOGLE_SHEETS_COVID_SEATCOUNT_SPREADSHEET_ID;
        if (sWish === "open") {
            // update status
            sResult = await updateSheetCell("B2", "open", sSpreadsheetId, "covid", oAuthorizationConfig);
        } else {
            sResult = await updateSheetCell("C2", "open", sSpreadsheetId, "covid", oAuthorizationConfig);
        }
    } catch (e) {
        return {
            success: false,
            message: "Error while opening the registration sheet"
        };
    }

    return {
        success: true,
        message: sResult
    };
}

module.exports = {
    validateInput,
    checkAvailability,
    registerName,
    openMassRegistration
};
