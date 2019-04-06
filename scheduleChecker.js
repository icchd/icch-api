const fnGetGoogleSpreadsheetAsJSON = require("./lib/spreadsheetReader");
const GoogleAuth = require("./lib/googleAuth");
const moment = require("moment");
const cellParser = require("./lib/cellParser");
const Errors = require("./errors");
const request = require("request");

async function triggerWebhook (oConfig) {

    const {
        dryRun: bDryRun,
        sundayScheduleCompletedWebhookURL: sSundayScheduleCompletedWebhookURL,
        spreadsheetId: sSpreadsheetId,
        authorization: sAuthorizationJSON,
        ranges: sRangesJSON
    } = oConfig;

    const oNextSundayRecord = await findNextSundayRecord(sSpreadsheetId, {
        authorization: sAuthorizationJSON,
        ranges: sRangesJSON
    });

    const bAllFieldsSpecified = Object.keys(oNextSundayRecord).every((sKey) => oNextSundayRecord[sKey]);

    if (!bAllFieldsSpecified) {
        throw new Errors.MissingRowsError();
    }

    const sEmailBody = prepareEmailBodyHTML(oNextSundayRecord);
    const sEmailSubjectDate = moment().weekday(7).format("ll");
    const bIsSocialGathering = oNextSundayRecord.activities.toLowerCase().indexOf("social") >= 0;

    const oWebhooksPostParams = {
        "value1": sEmailBody,
        "value2": `Sunday ${sEmailSubjectDate}`,
        "value3": bIsSocialGathering ? "(social gathering)" : ""
    };

    console.log(`Triggering POST request to ${sSundayScheduleCompletedWebhookURL} with parameters ${JSON.stringify(oWebhooksPostParams)}`);
    if (bDryRun) {
        console.log(`[DRY RUN] Triggered POST request to ${sSundayScheduleCompletedWebhookURL} with parameters ${JSON.stringify(oWebhooksPostParams)}`);
        return Promise.resolve();
    }

    const bSuccess = await request.post(
        sSundayScheduleCompletedWebhookURL,
        {
            json: oWebhooksPostParams
        },
        (error, response, body) => {
            if (!error && response.statusCode === 200) {
                console.log("Got response from service: " + body);
                return true;
            }
            return false;
        }
    );

    return bSuccess;
}


async function findNextSundayRecord (sSpreadsheetId, oConfig) {
    var aSpreadsheetJSON = await readSpreadsheetAsJson(sSpreadsheetId, oConfig);

    const aRows = mergeRowsTwoByTwo(aSpreadsheetJSON);

    updateFields(aRows, "date", cellParser.parseDate);

    const oNextSunday = moment().weekday(7);

    const [oNextSundayRecord] = aRows.filter(hasDate.bind(null, oNextSunday));
    if (!oNextSundayRecord) {
        const aAvailableDates = aRows.map((oDate) => oDate.date).map((oDate) => oDate.format("DD.MM"));
        throw new Error(`Cannot find ${oNextSunday.format("DD.MM")} in the spreadsheet. Available dates are: ${aAvailableDates.join(", ")}`);
    }

    console.log("Found record:", oNextSundayRecord);

    return oNextSundayRecord;
}

async function readSpreadsheetAsJson (sSpreadsheetId, oConfig) {
    const {
        authorization: oAuthorizationConfig,
        ranges: oRangesConfig
    } = oConfig;

    const oAuthorizationToken = await GoogleAuth.getGoogleAuthorization(oAuthorizationConfig);

    const oNextSunday = moment().weekday(7);

    const sQuarter = getDateQuarter(oNextSunday, oRangesConfig.quartersInSpreadsheet);

    console.log(`Got quarted ${sQuarter} for ${oNextSunday.format("DD/MM/YYYY")}`);

    const sWholeSpreadsheetRange = oRangesConfig.wholeDataRange;

    const aSpreadsheetJSON = await fnGetGoogleSpreadsheetAsJSON(
        oAuthorizationToken,
        sSpreadsheetId,
        `${sQuarter}!${sWholeSpreadsheetRange}`,
        {
            headerRow: 1
        }
    );

    // first row below header is always empty
    aSpreadsheetJSON.shift();

    console.log(`Spreadsheet contains ${aSpreadsheetJSON.length} rows`);

    return aSpreadsheetJSON;
}

function mergeRowsTwoByTwo (aRows) {
    return aRows.reduce((aRows, oNextRow, iIdx) => {
        var bEvenIdx = iIdx % 2 === 0;
        if (bEvenIdx) {
            aRows.push(oNextRow);
        } else {
            const aRowToMergeWith = aRows[aRows.length - 1];
            Object.keys(oNextRow).forEach((sKey) => {
                var vValueToConcatenate = oNextRow[sKey];

                if (typeof vValueToConcatenate === "string" && 
                        vValueToConcatenate.length > 0) {
                    aRowToMergeWith[sKey] += " " + oNextRow[sKey];
                }
            });
        }

        return aRows;
    }, []);
}

function updateFields (aRows, sFieldId, fnUpdate) {
    aRows.forEach((oRow) => {
        oRow[sFieldId] = fnUpdate(oRow[sFieldId]);
    });
}

function hasDate (oDesiredDay, oRow) {
    return oRow.date.isSame(oDesiredDay, "day");
}

function getDateQuarter (oDate, aPossibleQuarters) {
    var iMonth = parseInt(oDate.format("MM"), 10);
    let iQuarterIdx = null;
    switch (iMonth) {
        case 1:
        case 2:
        case 3:
            iQuarterIdx = 0;
            break;
        case 4:
        case 5:
        case 6:
            iQuarterIdx = 1;
            break;
        case 7:
        case 8:
        case 9:
            iQuarterIdx = 2;
            break;
        case 10:
        case 11:
        case 12:
            iQuarterIdx = 3;
            break;
        default:
            throw new Error("Invalid month" + iMonth);
    }

    return aPossibleQuarters[iQuarterIdx];
}

function prepareEmailBodyHTML (oNextSundayRecord) {

    return `<br />
<b>Priest</b> &rarr; ${oNextSundayRecord.priest}<br />
<br />
<b>Priest pick-up</b> &rarr; ${oNextSundayRecord["pick-up"]}<br />
<br />
<b>Mass Set-up</b> &rarr; ${oNextSundayRecord["set-up"]}<br />
<br />
<b>Lectors:</b><br />
<b>1st Reading 1</b> &rarr; ${oNextSundayRecord.lector.split(" ")[0]}<br />
<b>2nd Reading 2</b> &rarr; ${oNextSundayRecord.lector.split(" ")[1]}<br />
<br />
<b>Eucharistic Minister</b> &rarr; ${oNextSundayRecord.em}<br />
<br />
<b>Music</b> &rarr; ${oNextSundayRecord.music}<br />
`;

}

module.exports = {
    triggerWebhook
};
