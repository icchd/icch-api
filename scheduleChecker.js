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
        authorization: sAuthorizationJSON
    } = oConfig;

    var oSpreadsheetConfig = await getSpreadsheetConfig(oConfig.authorization, sSpreadsheetId);
    var aFieldNames = oSpreadsheetConfig.fieldNames.split(",");
    var oRangesConfig = {
        quartersInSpreadsheet: [
            "1st quarter",
            "2nd quarter",
            "3rd quarter",
            "4th quarter"
        ],
        wholeDataRange: oSpreadsheetConfig.dataRange
    };

    var aSpreadsheetJSON = await readSpreadsheetAsJson(sSpreadsheetId, {
        authorization: sAuthorizationJSON,
        ranges: oRangesConfig
    });

    const aRows = parseRows(aSpreadsheetJSON, "date");
    const oTodayRounded = moment(moment().format("YYYY/MM/DD"));
    const oClosestRecord = findClosestRecord(oTodayRounded, aRows);

    validateSundayRecordFields(oClosestRecord, aFieldNames);

    const oTemplateConfig = {
        emailTemplateHTML: oSpreadsheetConfig.emailTemplateHTML,
        templates: parseTemplates(oSpreadsheetConfig.templates)
    };

    const sEmailBody = prepareEmailBodyHTML(oClosestRecord, oTemplateConfig);
    const sEmailSubjectDate = oClosestRecord.date.format("ll");
    const bIsSocialGathering = oClosestRecord.activities.join(" ").toLowerCase().indexOf("social") >= 0;
    const sDayName = oClosestRecord.date.format('dddd');

    const oWebhooksPostParams = {
        "value1": sEmailBody,
        "value2": `${sDayName} ${sEmailSubjectDate}`,
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

function parseTemplates(sMultilineAssignments) {
    //
    // returns an object
    // <templateId> : {
    //    subject: "variable",
    //    cases: [<no value template>,<one value template>,<two values template>]
    // }
    //
    return sMultilineAssignments.split("\n").reduce((o, sAssignment) => {
        const [sName, sTemplate] = sAssignment.split("=");
        const [sSubject, sCases] = sTemplate.split(/[?]/u);
        o[sName] = {
            subject: sSubject.replace(/[}{]/gu, ""),
            cases: sCases.split("__")
        };
        return o;
    }, {});
}

async function getSpreadsheetConfig (oAuthorizationConfig, sSpreadsheetId) {
    const oAuthorizationToken = await GoogleAuth.getGoogleAuthorization(oAuthorizationConfig);

    const aaRows = await fnGetGoogleSpreadsheetAsJSON(
        oAuthorizationToken,
        sSpreadsheetId,
        `config!A1:B100`,
        {
            fixedHeaderField: false
        }
    );

    return buildConfig(aaRows);
}

function buildConfig (aaRows) {
    return aaRows.reduce((o, aRow) => {
        var [sKey, sValue] = aRow;
        o[sKey] = sValue;

        return o;
    }, {});

}

function validateSundayRecordFields (oNextSundayRecord, aExpectedFilledFields) {
    const aMissingFields = getFieldsWithoutValue(oNextSundayRecord, aExpectedFilledFields);
    const bAllFieldsHaveValue = aMissingFields.length === 0;
    if (!bAllFieldsHaveValue) {
        console.log("Found missing fields: " + aMissingFields.join(", "));
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

function findClosestRecord (oTargetDay, aRows) {
    const aRowsDistance = aRows
        .map(diffDays.bind(null, oTargetDay))
        .sort(sortOnField.bind(null, 'diff'))
        .filter((oDiff) => oDiff.diff >= 0);

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

function prepareEmailBodyHTML (oNextSundayRecord, oTemplateConfig) {
    var aNeededVariableNames = extractTemplateVariableNames(oTemplateConfig);
    var oNeededVariableValues = extractTemplateVariableValues(aNeededVariableNames, oTemplateConfig, oNextSundayRecord);

    var sEmailBody = oTemplateConfig.emailTemplateHTML;
    aNeededVariableNames.forEach((sVar) => {
        sEmailBody = sEmailBody.split(`{{${sVar}}}`).join(oNeededVariableValues[sVar]);
    });

    return sEmailBody;
}

function extractTemplateVariableValues (aNeededVariableNames, oTemplateConfig, oNextSundayRecord) {
    var oVarValues = aNeededVariableNames.reduce((o, sVarName) => {
        var vValue = oNextSundayRecord[sVarName];
        if (vValue) {
            o[sVarName] = typeof vValue === "string" ? vValue : vValue.join(", ");
        }
        return o;
    }, {});

    // instantiate single templates
    var oTemplates = oTemplateConfig.templates;
    Object.keys(oTemplates).forEach((sKey) => {
        var oTemplate = oTemplates[sKey];
        var aValues = oNextSundayRecord[oTemplate.subject];
        if (aValues) {
            var iNumEntries = aValues.length;
            if (iNumEntries > oTemplate.cases.length) {
                throw new Error("The subtemplate for " + sKey + " needs more places. Found " + iNumEntries + " values.");
            }
            var sSubTemplate = oTemplate.cases[iNumEntries];
            sSubTemplate = sSubTemplate.split("{{0}}").join(aValues[0]);
            sSubTemplate = sSubTemplate.split("{{1}}").join(aValues[1]);
            oVarValues[sKey] = sSubTemplate;
        } else {
            console.log("Cannot find values for " + oTemplate.subject + " perhaps this is an invalid placeholder in the template (typo?)");
        }
    });

    return oVarValues;
}

function extractTemplateVariableNames (oTemplateConfig) {
    const sTemplate = oTemplateConfig.emailTemplateHTML;
    const regexp = /\{\{(.+?)\}\}/gu;
    const matches = sTemplate.matchAll(regexp);

    var oVariables = {};
    for (const match of matches) {
      oVariables[match[1]] = true;
    }

    Object.keys(oTemplateConfig.templates).forEach((sKey) => {
        oVariables[sKey] = true;
    });

    return Object.keys(oVariables);
}

function getFunctionForTest (sFunctionName) {
    const oAvailableFunctions = {
        validateSundayRecordFields,
        parseRows,
        diffDays,
        findClosestRecord
    };

    return oAvailableFunctions[sFunctionName];
}

module.exports = {
    triggerWebhook,
    getFunctionForTest
};
