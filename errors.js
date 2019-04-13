const ErrorClasses = [
    {
        name: "MissingRowsError",
        message: "The following fields have not been filled: {missingFields}. So I cannot send the e-mail",
        args: ["missingFields"]
    }
].reduce((oErrors, oErrorInfo) => {
    oErrors[oErrorInfo.name] = createErrorClass(oErrorInfo);
    return oErrors;
}, {});

function createErrorClass (oErrorInfo) {

    function ErrorConstructor (oArgs) {
        var aMissingArguments = getMissingFields(oArgs, oErrorInfo.args);
        if (aMissingArguments.length > 0) {
            throw new Error(`You must pass all arguments to ${oErrorInfo.name}. Missing arguments: ${aMissingArguments.join(", ")}.`);
        }
        this.name = oErrorInfo.name;
        this.message = interpolate(oErrorInfo.message, oArgs, oErrorInfo.args);
    }

    return ErrorConstructor;
}

function getMissingFields (oRecord, aFieldNames) {
    return aFieldNames.filter((sKey) => !oRecord[sKey]);
}

function interpolate (sTemplate, oArgs, aArgNames) {
    return aArgNames.reduce(
        (sMessage, sArgName) => sMessage.replace(`{${sArgName}}`, oArgs[sArgName]), 
        sTemplate
    );
}


module.exports = ErrorClasses;
