const moment = require("moment");

function parseDay (sDate) {
    const aDayMatch = sDate.match(/(?<day>[0-9]+)/u);

    let sDay = "";
    if (aDayMatch) {
        sDay = aDayMatch.groups.day;
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
        ["Sept", "September"],
        ["Oct", "October"],
        ["Nov", "November"],
        ["Dic", "Dicember"]
    ].reduce((oMonthNumber, aMonth, iIdx) => {
        aMonth.forEach((sMonth) => {
            oMonthNumber[sMonth] = iIdx + 1;
        });
        return oMonthNumber;
    }, {});

    return oMapping;
}

function parseMonth (sDate) {
    let aMatch = sDate.match(/[0-9]+?[^0-9]+(?<month>[0-9]+)/u);
    if (aMatch) {
        return aMatch.groups.month;
    }

    const oMonthNumber = createMonthNameToNumberMapping();

    const aMonthNames = Object.keys(oMonthNumber);
    const reMonthMatch = new RegExp(`(?<month>${aMonthNames.join("|")})`, "u");

    aMatch = sDate.match(reMonthMatch);
    if (aMatch) {
        return oMonthNumber[aMatch.groups.month];
    }

    throw new Error(`cannot parse month from ${sDate}`);
}

function parseDate (sDate) {
    var sDay = parseDay(sDate);
    var sMonth = parseMonth(sDate);

    return moment(`2019-${sMonth}-${sDay}`, "YYYY-MM-DD");
}

module.exports = {
    parseDate
};
