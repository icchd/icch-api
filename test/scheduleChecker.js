const assert = require("assert");
const {describe, it} = require("mocha");
const oScheduleChecker = require("../scheduleChecker");


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
        it(`should not throw when " + ${aExpectedFields}`, () => {
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
