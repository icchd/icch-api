/**
 * @fileOverview
 *
 * Reads the whole content of a google spreadsheet as json.
 */

const {google} = require("googleapis");

async function update (oAuthorizationToken, sSpreadsheetId, sSpreadsheetRange, oOptions) {

    const oAuthorizedSheetsAPI = getAuthorizedApi("sheets", oAuthorizationToken);
    const oRequest = {
        spreadsheetId: sSpreadsheetId,
        range: sSpreadsheetRange,
        resource: {
            values: [
                [oOptions.value]
            ]
        }
    };

    return oAuthorizedSheetsAPI.spreadsheets.values.update(oRequest);
}

function getAuthorizedApi (sAPIName, oAuthorizationToken) {
    const oAuthorizedAPI = google[sAPIName]({
        version: "v4",
        auth: oAuthorizationToken
    });

    return oAuthorizedAPI;
}

module.exports = {
    update
};
