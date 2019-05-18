const assert = require("assert");
const {describe, it} = require("mocha");
const dateParser = require("../lib/dateParser");


describe("parseDate", () => {
    function test (sDate, sExpected) {
        it(`should parse ${sDate}`, () => {
            const oParsed = dateParser.parseDate(sDate);
            assert.equal(oParsed.format("DD-MM-YYYY"), sExpected);
        });
    }
    test("4.10", "04-10-2019");
    test("4.10.", "04-10-2019");
    test("Mar 24", "24-03-2019");
});
