module.exports = [
    {
        name: "MissingRowsError",
        message: "Not all fields from the record are filled, I cannot send the e-mail"
    }
].reduce((oErrors, oErrorInfo) => {
    oErrors[oErrorInfo.name] = createErrorClass(oErrorInfo);
    return oErrors;
}, {});

function createErrorClass (oErrorInfo) {

    function ErrorConstructor () {
        this.name = oErrorInfo.name;
        this.message = oErrorInfo.message;
    }

    return ErrorConstructor;
}
