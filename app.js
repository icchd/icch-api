var express = require("express");
var bodyParser = require("body-parser");
var compression = require("compression");
var app = express();

(async () => {
    const downloader = require("./download-puppeteer");
    await downloader.download();
    console.log("Post-puppeteer");

    app.use(compression());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: true}));

    var routes = require("./routes/routes.js")(app);

    var sPortEnvVarName = process.env.PORT_ENVVAR_NAME;

    var server = app.listen(process.env[sPortEnvVarName] || 9999, function () {
        console.log("Server address: " + JSON.stringify(server.address(), null, 3));
        console.log("Listening on port %s...", server.address().port);
    });

    var routes = require("./routes/routes.js")(app);
})();
