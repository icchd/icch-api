const fnGetGoogleSpreadsheetAsJSON = require("./lib/spreadsheetReader");
const GoogleAuth = require("./lib/googleAuth");
const moment = require("moment");
const dateParser = require("./lib/dateParser");
const Errors = require("./errors");
const request = require("request");


async function triggerWebhook (oConfig) {
    const {
        dryRun: bDryRun,
        sundayScheduleCompletedWebhookURL: sSundayScheduleCompletedWebhookURL,
        spreadsheetId: sSpreadsheetId,
        authorization: sAuthorizationJSON,
        ranges: sRangesJSON,
        fieldNames: aFieldNames
    } = oConfig;

    var aSpreadsheetJSON = await readSpreadsheetAsJson(sSpreadsheetId, {
        authorization: sAuthorizationJSON,
        ranges: sRangesJSON
    });

    const oNextSundayRecord = findRecordClosestToDay(moment(), aSpreadsheetJSON);

    validateSundayRecordFields(oNextSundayRecord, aFieldNames);

    const sEmailBody = prepareEmailBodyHTML(oNextSundayRecord);
    const sEmailSubjectDate = moment().weekday(7).format("ll");
    const bIsSocialGathering = oNextSundayRecord.activities.join(" ").toLowerCase().indexOf("social") >= 0;

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

function validateSundayRecordFields (oNextSundayRecord, aExpectedFilledFields) {
    const aMissingFields = getFieldsWithoutValue(oNextSundayRecord, aExpectedFilledFields);
    const bAllFieldsHaveValue = aMissingFields.length === 0;
    if (!bAllFieldsHaveValue) {
        throw new Errors.MissingRowsError({
            missingFields: aMissingFields.join(", ")
        });
    }
}

function getFieldsWithoutValue (oNextSundayRecord, aFieldNames) {
    return aFieldNames.filter((sKey) => !oNextSundayRecord[sKey] || oNextSundayRecord[sKey].length === 0);
}

function diffDays (oDay, oParsedDateRow) {
    const sDaysDiff = moment.duration(oParsedDateRow.date.diff(oDay)).as("days");

    return {
        diff: sDaysDiff,
        record: oParsedDateRow
    };
}

function sortOnField (sFieldName, a, b) {
    if (a[sFieldName] < b[sFieldName]) {
        return -1;
    }
    if (a[sFieldName] > b[sFieldName]) {
        return 1;
    }
    return 0;
}

function findRecordClosestToDay (oTargetDay, aSpreadsheetJSON) {
    const aRows = parseRows(aSpreadsheetJSON, "date");
    const aRowsDistance = aRows.map(diffDays.bind(null, oTargetDay)).sort(sortOnField.bind('diff'));
    if (aRowsDistance.length === 0) {
        throw new Error(`There are no rows in the spreadsheet`);
    }

    const oNextRecord = aRowsDistance[0].record;

    console.log("Found record:", oNextRecord);

    return oNextRecord;
}

async function readSpreadsheetAsJson (sSpreadsheetId, oConfig) {
    const {
        authorization: oAuthorizationConfig,
        ranges: oRangesConfig
    } = oConfig;

    const oAuthorizationToken = await GoogleAuth.getGoogleAuthorization(oAuthorizationConfig);

    const oToday = moment();
    const oNextSunday = moment().weekday(7);

    const sQuarterToday = getDateQuarter(oToday, oRangesConfig.quartersInSpreadsheet);
    const sQuarterNextSunday = getDateQuarter(oNextSunday, oRangesConfig.quartersInSpreadsheet);

    console.log(`Got today's quarter ${sQuarterToday} for ${oToday.format("DD/MM/YYYY")}`);
    console.log(`Got next Sunday's quarter ${sQuarterNextSunday} for ${oNextSunday.format("DD/MM/YYYY")}`);

    const sWholeSpreadsheetRange = oRangesConfig.wholeDataRange;

    const aSpreadsheetJSONCurrentQuarter = await fnGetGoogleSpreadsheetAsJSON(
        oAuthorizationToken,
        sSpreadsheetId,
        `${sQuarterToday}!${sWholeSpreadsheetRange}`,
        {
            headerRow: 1
        }
    );

    let aSpreadsheetJSON = aSpreadsheetJSONCurrentQuarter;

    if (sQuarterToday !== sQuarterNextSunday) {

        const aSpreadsheetJSONNextQuarter = await fnGetGoogleSpreadsheetAsJSON(
            oAuthorizationToken,
            sSpreadsheetId,
            `${sQuarterNextSunday}!${sWholeSpreadsheetRange}`,
            {
                headerRow: 1
            }
        );

        aSpreadsheetJSON = aSpreadsheetJSONCurrentQuarter.concat(aSpreadsheetJSONNextQuarter);

    }

    // first row below header is always empty
    aSpreadsheetJSON.shift();

    console.log(`Spreadsheet contains ${aSpreadsheetJSON.length} rows`);

    return aSpreadsheetJSON;
}

function parseRows (aRows, sLeadingFieldName) {
    if (!sLeadingFieldName) {
        throw new Error("Leading field name was not given");
    }

    var aRowsParsed = aRows.reduce((aRows, oNextRow) => {
        const bNoFieldHasValue = Object.keys(oNextRow).map((sKey) => oNextRow[sKey]).join("").trim().length === 0;
        if (bNoFieldHasValue) {
            return aRows;
        }

        const sLeadingFieldValue = oNextRow[sLeadingFieldName];

        if (oNextRow[sLeadingFieldName]) {
            const oNewRecord = createNewRecord(oNextRow);
            aRows.push(oNewRecord);
        } else {
            const oPreviousRecord = aRows.length > 0 ? aRows[aRows.length - 1] : null;
            mergeRecord(oPreviousRecord, oNextRow);
        }

        return aRows;
    }, []);

    updateFields(aRowsParsed, "date", ([sDate]) => dateParser.parseDate(sDate));

    return aRowsParsed;

    function createNewRecord(oSourceRow) {
        return Object.keys(oSourceRow).reduce(
            (oTarget, sKey) => {
                const sSourceRowValue = oSourceRow[sKey];
                oTarget[sKey] = sSourceRowValue ? [sSourceRowValue] : [];
                return oTarget;
            },
            {}
        );
    }

    function mergeRecord (oTargetRecord, oRecordToMerge) {
        const sTargetKeys = Object.keys(oTargetRecord).sort().join(", ");
        const sToMergeKeys = Object.keys(oRecordToMerge).sort().join(", ");

        if (sTargetKeys !== sToMergeKeys) {
            throw new Error(`Target record and merging record don't have the same keys!\nTarget: ${sTargetKeys}\nMerging: ${sToMergeKeys}`);
        }

        Object.keys(oTargetRecord).forEach(
            (sKey) => {
                const sValueToMerge = oRecordToMerge[sKey];
                if (sValueToMerge) {
                    oTargetRecord[sKey].push(sValueToMerge);
                }
            }
        );
    }
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

    function formatPickup (aPickupRecord) {
        switch (aPickupRecord.length) {
            case 0:
                return "N/D";
            case 1:
                return aPickupRecord[0];
            default:
                return `${aPickupRecord[0]} (main), ${aPickupRecord[1]} (backup)`;
        }
    }

    function formatLectors (aLectorsRecord) {
        switch (aLectorsRecord.length) {
            case 0:
                return "No lector";
            case 1:
                return `<b>1st and 2nd Reading</b> &rarr; ${aLectorsRecord[0]}<br />`;
            case 2:
                return `<b>1st Reading</b> &rarr; ${aLectorsRecord[0]}<br />`
                    + `<b>2nd Reading</b> &rarr; ${aLectorsRecord[1]}<br />`;
            default:
                return aLectorsRecord.map((sName, iIdx) => `<b>Reading ${iIdx + 1}</b> &rarr; ${sName}<br />`).join("");
        }
    }

    return `<br />
<b>Priest</b> &rarr; ${oNextSundayRecord.priest.join(", ")}<br />
<br />
<b>Priest pick-up</b> &rarr; ${formatPickup(oNextSundayRecord["pick-up"])}<br />
<br />
<b>Mass Set-up</b> &rarr; ${oNextSundayRecord["set-up"].join(", ")}<br />
<br />
<b>Lectors:</b><br />
${formatLectors(oNextSundayRecord.lector)}
<br />
<b>Eucharistic Minister</b> &rarr; ${oNextSundayRecord.em.join(", ")}<br />
`;

}

function getFunctionForTest (sFunctionName) {
    const oAvailableFunctions = {
        validateSundayRecordFields,
        parseRows,
        diffDays
    };

    return oAvailableFunctions[sFunctionName];
}

module.exports = {
    triggerWebhook,
    getFunctionForTest
};
