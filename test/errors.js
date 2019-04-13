const assert = require("assert");
const {describe, it} = require("mocha");
const Errors = require("../errors");


describe("errors", () => {

    function test () {
        it("should create MissingRowsError", () => {
            const oError = new Errors.MissingRowsError({
                missingFields: ["field1", "field2", "field3"].join(", ")
            });
            const sExpectedErrorMessage = "The following fields have not been filled: field1, field2, field3. So I cannot send the e-mail";
            
            assert.equal(oError.message, sExpectedErrorMessage);
        });
    }

    test();
});
