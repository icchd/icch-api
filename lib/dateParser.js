/**
 * @fileOverview parses a date that was entered manually in the spreadsheet as
 * a moment object.
 *
 * The parser works by first trying to find a month and then the day. Year
 * is assumed to be the current year.
 */

const moment = require("moment");

function parseDay (sDate) {
    const aDayMatch = sDate.match(/([0-9]+)/u);

    let sDay = "";
    if (aDayMatch) {
        sDay = aDayMatch[1];
    } else {
        throw new Error(`cannot parse day from ${sDate}`);
    }

    return sDay;
}

function createMonthNameToNumberMapping () {
    const oMapping = [
        ["Jan", "January"],
        ["Feb", "February"],
        ["Mar"],
        ["Apr", "April"],
        ["May"],
        ["Jun", "June"],
        ["Jul", "July"],
        ["Aug", "August"],
        ["Sep", "Sept", "September"],
        ["Oct", "October"],
        ["Nov", "November"],
        ["Dec", "December"]
    ].reduce((oMonthNumber, aMonth, iIdx) => {
        aMonth.forEach((sMonth) => {
            oMonthNumber[sMonth] = iIdx + 1;
        });
        return oMonthNumber;
    }, {});

    return oMapping;
}

function parseMonth (sDate) {
    let aMatch = sDate.match(/[0-9]+?[^0-9]+([0-9]+)/u);
    if (aMatch) {
        // month
        return aMatch[1];
    }

    const oMonthNumber = createMonthNameToNumberMapping();

    const aMonthNames = Object.keys(oMonthNumber);
    const reMonthMatch = new RegExp(`(${aMonthNames.join("|")})`, "u");

    aMatch = sDate.match(reMonthMatch);
    if (aMatch) {
        const sMonth = aMatch[1];
        return oMonthNumber[sMonth];
    }

    throw new Error(`cannot parse month from ${sDate}`);
}

function parseDate (sDate) {
    var sDay = parseDay(sDate);
    var sMonth = parseMonth(sDate);
    var sCurrentYear = moment().year();

    return moment(`${sCurrentYear}-${sMonth}-${sDay}`, "YYYY-MM-DD");
}

module.exports = {
    parseDate
};
