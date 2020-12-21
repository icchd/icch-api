
function fnLog (sMessage) {
    if (process.env["LOG_ENABLE"] === "true") {
        console.log(sMessage);
    }
}

function fnError (sMessage) {
    console.log(sMessage);
}


module.exports = {
    log: fnLog,
    error: fnError
};
