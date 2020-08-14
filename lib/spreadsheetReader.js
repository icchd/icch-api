/**
 * @fileOverview
 *
 * Reads the whole content of a google spreadsheet as json.
 */

const {google} = require("googleapis");

async function read (oAuthorizationToken, sSpreadsheetId, sSpreadsheetRange, oOptions) {

    return new Promise((fnResolve, fnReject) => {
        var oAuthorizedSheetsAPI = getAuthorizedApi("sheets", oAuthorizationToken);

        var {
            fixedHeaderField: bFixedHeaderField = true,
            headerRow: iHeaderRow = 1
        } = oOptions;

        oAuthorizedSheetsAPI.spreadsheets.values.get({
          spreadsheetId: sSpreadsheetId,
          range: sSpreadsheetRange,
          majorDimension: "ROWS"
        }, (sError, oResult) => {
            if (sError) {
                fnReject(new Error(`API Error: ${sError}`));
                return;
            }

            const aaAllRows = oResult.data.values;
            if (bFixedHeaderField) {
                const aAllRowsNames = createNamedRows(aaAllRows, iHeaderRow);
                fnResolve(aAllRowsNames);
            } else {
                fnResolve(aaAllRows);
            }
        });
    });
}

function getAuthorizedApi (sAPIName, oAuthorizationToken) {
    const oAuthorizedAPI = google[sAPIName]({
        version: "v4",
        auth: oAuthorizationToken
    });

    return oAuthorizedAPI;
}

function createNamedRows (aaRowsArray, iHeaderRow) {

    const iHeaderRowIdx = iHeaderRow - 1;
    const [aHeaderFields] = aaRowsArray.splice(iHeaderRowIdx, 1);

    return aaRowsArray.map(
        (aRow) => aHeaderFields.reduce(
            (oRecord, sHeaderFieldName, iValueIdx) => {
                var sFieldName = sHeaderFieldName.toLowerCase();
                oRecord[sFieldName] = aRow[iValueIdx];

                if (typeof oRecord[sFieldName] === "string") {
                    oRecord[sFieldName] = oRecord[sFieldName].trim();
                }

                return oRecord;
            },
            { }
        )
    );
}


module.exports = read;
