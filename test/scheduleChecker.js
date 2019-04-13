const assert = require("assert");
const moment = require("moment");
const {describe, it} = require("mocha");
const oScheduleChecker = require("../scheduleChecker");

function m (sDateDDMMYYYY) {
    return moment(sDateDDMMYYYY, "DD/MM/YYYY");
}

describe("parseRows", () => {

    test("can parse two separate records", [
      { date: 'June 2', color: 'blue', number: '1' },
      { date: 'May 6', color: 'red', number: '2' }
    ], [
      { date: m("02/06/2019"), color: ['blue'], number: ['1'] },
      { date: m("06/05/2019"), color: ['red'], number: ['2'] }
    ]);

    test("can merge the next record correctly", [
      { date: 'June 2', color: 'blue', number: '1' },
      { date: '', color: 'red', number: '' }
    ], [
      { date: m("02/06/2019"), color: ['blue', 'red'], number: ['1'] }
    ]);

    test("can merge multiple records correctly", [
      { date: 'June 2', color: 'blue', number: '1' },
      { date: '', color: 'red', number: '' },
      { date: '', color: 'orange', number: '2' },
      { date: '', color: 'green', number: '3' },
      { date: '', color: '', number: '' },  // ignored
      { date: '', color: '', number: '' }
    ], [
      { date: m("02/06/2019"), color: ['blue', 'red', 'orange', 'green'], number: ['1', '2', '3'] }
    ]);

    test("can recognize the beginning of new record fields", [
      { date: 'June 2', color: 'blue', number: '1' },
      { date: '', color: 'red', number: '' },
      { date: '', color: 'orange', number: '2' },
      { date: '', color: 'green', number: '3' },
      { date: '', color: '', number: '' },  // ignored
      { date: '', color: '', number: '' },
      { date: 'May 6', color: '', number: '1' },
      { date: '', color: '', number: '2' },
      { date: '', color: '', number: '3' },
      { date: 'April 28', color: '', number: '64' },
      { date: 'June 9 - Pentecost', color: 'green', number: '128' }
    ], [
      { date: m("02/06/2019"), color: ['blue', 'red', 'orange', 'green'], number: ['1', '2', '3'] },
      { date: m("06/05/2019"), color: [], number: ['1', '2', '3'] },
      { date: m("28/04/2019"), color: [], number: ['64'] },
      { date: m("09/06/2019"), color: ['green'], number: ['128'] }
    ]);

    function test (sTestDescription, aRows, aExpectedRows) {
        it(sTestDescription, () => {

            const fn = oScheduleChecker.getFunctionForTest("parseRows");
            const aParsed = fn(aRows, "date");
            assert.equal(aParsed.length, aExpectedRows.length);
            assert.deepEqual(Object.keys(aParsed).sort(), Object.keys(aExpectedRows).sort());

            aParsed.forEach((oParsed, iIdx) => {
                var oExpected = aExpectedRows[iIdx];

                Object.keys(oParsed).forEach((sFieldName) => {
                    const sValue1 = oParsed[sFieldName].format 
                        ? oParsed[sFieldName].format("DD/MM/YYYY")
                        : oParsed[sFieldName];
                    const sValue2 = oExpected[sFieldName].format 
                        ? oExpected[sFieldName].format("DD/MM/YYYY")
                        : oExpected[sFieldName];

                    assert.deepEqual(sValue1, sValue2);
                });
            })
        });
    }
});

describe("validateSundayRecordFields", () => {

    testPasses({
        "field1": "something",
        "field2": "something else",
        "field3": "something more"
    }, ["field1", "field2", "field3"]);

    testFails({
        "field1": "something",
        "field3": "something more"
    }, ["field1", "field2", "field3"], "The following fields have not been filled: field2. So I cannot send the e-mail");

    testFails({
    }, ["field1", "field2", "field3"], "The following fields have not been filled: field1, field2, field3. So I cannot send the e-mail");

    function testPasses (oSundayRecord, aExpectedFields) {
        it(`should not throw when ${aExpectedFields}`, () => {
            const fn = oScheduleChecker.getFunctionForTest("validateSundayRecordFields");

            let bThrows = false;
            try {
                fn(oSundayRecord, aExpectedFields);
            } catch (oError) {
                bThrows = true;
            }

            assert.equal(bThrows, false);
        });
    }

    function testFails (oSundayRecord, aExpectedFields, sExpectedErrorMessage) {
        it(`should throw when ${aExpectedFields}`, () => {
            const fn = oScheduleChecker.getFunctionForTest("validateSundayRecordFields");

            let bThrows = false;
            let sErrorMessage = null;
            try {
                fn(oSundayRecord, aExpectedFields);
            } catch (oError) {
                bThrows = true;
                sErrorMessage = oError.message;
            }

            assert.equal(bThrows, true);
            assert.equal(sErrorMessage, sExpectedErrorMessage);
        });
    }

});
