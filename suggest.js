const rp = require("request-promise");
const cheerio = require("cheerio");
const URI = require("urijs");

function log (s) {
    console.log(s);
}

function request(url) {
    log("---> " + url);
    return rp({
        uri: url,
        transform: function (body) {
            return cheerio.load(body);
        }
    });
}

const S_SITE_URL = "http://liturgy.slu.edu/index.html";
const MOMENTS_SEARCH_KEYWORDS = [
    "Gathering", "Gifts", "Communion", "Sending"
];

let allData = null;

function initAllData () {
    allData = {
        sunday: null,
        sundayLink: null,
        musicIndexLink: null,
        churchesIndex: []
    };
}

function isMomentIncluded (moment) {
    var bInclude = false;
    MOMENTS_SEARCH_KEYWORDS.forEach((keyword) => {
        bInclude = bInclude || moment.toLowerCase().indexOf(keyword.toLowerCase()) >= 0;
    });

    return bInclude;
}

function extractSuggestions (churchIndexUrl) {
    var songListLink = URI(churchIndexUrl).absoluteTo(allData.musicIndexLink).toString();
    var suggestions = {};

    return request(songListLink).then(function ($) {
        $(".content1 > p strong").each(function () {
            var moment = $(this).text();
            var song = $(this).parent().text().replace(moment + ":", "").trim();

            if (song.length > 0) {
                suggestions[moment] = song;
            }
        });

        return suggestions;
    });
}

function getSuggestions () {

    initAllData();

    return request(S_SITE_URL)
        .then(($) => {
            var menu = $("select > option[selected]");
            var title = menu.text();
            var link = menu.attr("value");

            allData.sunday = title;
            allData.sundayLink = link;

            return allData;
        })
        .then((data) => {
            var musicIndexPath = "/" + data.sundayLink.replace("main", "musicparishes");
            var indexUri = URI(musicIndexPath).absoluteTo(S_SITE_URL).toString();

            allData.musicIndexLink = indexUri;

            return request(indexUri);
        })
        .then(($) => {

            $(".content a").each(function () {
                var linkText = $(this).text();
                var linkHref = $(this).attr("href");
                var linkUrl = URI(linkHref).absoluteTo(allData.musicIndexLink).toString();
                allData.churchesIndex.push({
                    title: linkText,
                    url: linkUrl
                });
            });

            return allData.churchesIndex;
        })
        .then((churchesIndex) => {

            var allSuggestions = { };

            return new Promise (function (fnDone) {

                churchesIndex
                    .map((churchIndex) => extractSuggestions(churchIndex.url))
                    .reduce(function (previousPromise, nextPromise) {

                        return previousPromise.then(function () {

                            return nextPromise
                                .then(function (thisChurchSuggestions) {
                                    Object.keys(thisChurchSuggestions).forEach(function (moment) {
                                        if (isMomentIncluded(moment)) {
                                            if (!allSuggestions[moment]) {
                                                allSuggestions[moment] = {};
                                            }

                                            var song = thisChurchSuggestions[moment];
                                            if (!allSuggestions[moment].hasOwnProperty(song)) {
                                                allSuggestions[moment][song] = 0;
                                            }
                                            allSuggestions[moment][song]++;
                                        }

                                        return true;
                                    });
                            });
                        });

                    }, Promise.resolve())
                    .then(function () {
                        fnDone(allSuggestions);
                    });
            });
        })
        .then(function (allSuggestions) {
            var oCollectedSuggestions = {};

            Object.keys(allSuggestions).forEach((moment) => {
                let suggestions = allSuggestions[moment];
                oCollectedSuggestions[moment] = [];

                Object.keys(suggestions).forEach((suggestion) => {
                    let count = suggestions[suggestion];
                    let countString = "";
                    if (count > 1) {
                        countString = ` (${count})`;
                    }

                    let suggestionNiceText = `${suggestion}${countString}`;
                    oCollectedSuggestions[moment].push(suggestionNiceText);

                });
            });

            return {
                sunday: allData.sunday,
                suggestions: oCollectedSuggestions
            }
        })
        .catch((err) => {
            return `ERROR: ${err}. Data found so far: ${JSON.stringify(allData)}`;
        });
}

module.exports = {
    getSuggestions
};

