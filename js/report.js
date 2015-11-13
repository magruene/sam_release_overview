var teams = ["Skipper", "Catta", "Yankee", "Private", "Rico", "Kowalski"],
    epicsPerTeam = {},
    baseEpicFilter,
    statusIndicatorBaseUrl = "http://jira.swisscom.com/download/resources/de.polscheit.jira.plugins.traffic-light_status:resources/images/status_{status}18.png",
    table,
    onJira;

//if not on jira, we need to initialize this.
if (!AJS) {
    onJira = false;
    var AJS = {};
    AJS.$ = $;
} else {
    onJira = true;
}


function init(newBaseEpicFilter) {
    baseEpicFilter = newBaseEpicFilter;
    AJS.$(document).ajaxStop(function () {
        AJS.$(this).unbind("ajaxStop");
        prepareTable();
    });
    startReportGeneration();
}

function startReportGeneration() {
    resetTable();

    var getAllEpicsForTeams = "http://jira.swisscom.com/rest/api/2/search?maxResults=500&jql=filter=" + baseEpicFilter;
    ajaxCall(getAllEpicsForTeams, fetchRelevantEpicInformations);
}

function prepareTable() {
    if ($.fn.dataTable.isDataTable('#myTable')) {
        table.destroy();
    }

    table = AJS.$('#myTable').DataTable({
        "order": [[0, "asc"]],
        "iDisplayLength": 50
    });
    if (onJira) {
        gadget.resize();
    }
}

function prepareTableRow(team, epic, sumForEpic) {
    var epicKey = epic.key;
    AJS.$("#myTable tbody").append("<tr id='" + epicKey + "'></tr>");
    var tableRow = AJS.$("#" + epicKey);
    tableRow.append("<td>" + team + "</td>");
    tableRow.append("<td>" + epic.fields.status.name + "</td>");
    tableRow.append("<td><a href='http://jira.swisscom.com/browse/" + epicKey + "'>" + epicKey + "</a></td>");
    tableRow.append("<td><a href='http://jira.swisscom.com/browse/" + epicKey + "'>" + epic.fields.summary + "</a></td>");
    var solutionDesigner = epic.fields.customfield_17052 != null ? epic.fields.customfield_17052 : "None";
    tableRow.append("<td><a href='http://jira.swisscom.com/secure/ViewProfile.jspa?name=" + solutionDesigner.key + "'>" + solutionDesigner.displayName + "</a></td>");
    var devSpoc = epic.fields.customfield_17053 != null ? epic.fields.customfield_17053 : "None";
    tableRow.append("<td><a href='http://jira.swisscom.com/secure/ViewProfile.jspa?name=" + devSpoc.key + "'>" + devSpoc.displayName + "</a></td>");
    var labels = tableRow.append("<td class='labels'><div class='labels-wrap value'><ul id='" + epicKey + "_labels' class='labels'></div></td>");
    var labelUl = $(labels.find("#" + epicKey + "_labels"));
    AJS.$.each(epic.fields.labels, function (index, label) {
        labelUl.append("<li><a class='lozenge' href = 'http://jira.swisscom.com/secure/IssueNavigator.jspa?reset=true&amp;jqlQuery=labels='" + label + " title='" + label + "'><span>" + label + "</span></a></li>");
    });

    tableRow.append("<td>" + Math.round((sumForEpic / 28800) * 100) / 100 + "</td>");

    tableRow.append("<td><img id='status_" + epicKey + "' src='" + statusIndicatorBaseUrl.replace("{status}", epic.fields.customfield_17554) + "'/></td>");
    AJS.$("#status_" + epicKey).click(epic, function (ev) {
        console.log(ev.data);
        var element = AJS.$(ev.target);
        var newState;
        if (element.attr("src").indexOf("green") != -1) {
            element.attr("src", element.attr("src").replace("green", "yellow"));
            newState = "16549"; //yellow
        } else if (element.attr("src").indexOf("yellow") != -1) {
            element.attr("src", element.attr("src").replace("yellow", "red"));
            newState = "16548"; //red
        } else if (element.attr("src").indexOf("red") != -1) {
            element.attr("src", element.attr("src").replace("red", "green"));
            newState = "16550"; //green
        }
        updateEpicState(epic, newState);
    });
    tableRow.append("<td>" + epic.fields.customfield_17650 + "</td>");
}

function updateEpicState(epic, newState) {
    var data = {
        "customfield_17554": newState,
        "issueId": epic.id,
        "singleFieldEdit": "true",
        "fieldsToForcePresent": "customfield_17554"
    };
    AJS.$.ajax({
        url: "http://jira.swisscom.com/secure/AjaxIssueAction.jspa?decorator=none",
        crossDomain: true,
        headers: {
            "X-Atlassian-Token": "no-check",
            "X-AUSERNAME": "taagrma3",
            "Cookie": "JSESSIONID=1E9D832CFCCD0DAD3D4D28D161A45FA3; atlassian.xsrf.token=A0G2-HDW2-Z1MJ-TM9B|1dbe6729426934d333c50fc0cac87853a9840fce|lin"
        },
        type: "POST",
        data: JSON.stringify(data),
        contentType: 'application/json',
        dataType: "json"
    });
}

function resetTable() {
    epicsPerTeam = {};
    if (table) {
        table.destroy();
    }
    AJS.$("tbody").empty();
}

function fetchRelevantEpicInformations(issues) {

    var groupedIssuesByTeam = _.groupBy(issues, function (issue) {
        return issue.fields.customfield_14850.value;
    });


    AJS.$.each(_.keys(groupedIssuesByTeam), function (index, currentTeam) {
        epicsPerTeam[currentTeam] = {};
        var issueGroup = groupedIssuesByTeam[currentTeam];

        var sortable = [];
        for (var epic in issueGroup) {
            sortable.push(issueGroup[epic]);
        }
        sortable.sort(function (a, b) {
            if (a.key < b.key) return 1;
            if (a.key > b.key) return -1;
            return 0;
        });

        AJS.$.each(sortable, function (index, epic) {
            var getIssuesForEpicsUrl = "http://jira.swisscom.com/rest/api/2/search?maxResults=500&jql='Epic Link' in (" + epic.key + ") and status != Closed";

            AJS.$.ajax({
                url: getIssuesForEpicsUrl,
                contentType: 'application/json',
                dataType: "json",
                success: function (data) {
                    return calculateRemainingEstimateForMileStone(currentTeam, epic, data.issues);
                }
            });
        });
    });
}

function calculateRemainingEstimateForMileStone(team, epic, issues) {

    var sum = 0;
    AJS.$.each(issues, function (index, issue) {
        sum += issue.fields.timeoriginalestimate;
    });
    prepareTableRow(team, epic, sum);
}

function ajaxCall(url, successFunction) {
    return AJS.$.ajax({
        url: url,
        contentType: 'application/json',
        dataType: "json",
        success: function (data) {
            successFunction(data.issues);
        }
    });
}

function ajaxCallUnique(url, team, specialIdentifier, successFunction) {
    return AJS.$.ajax({
        url: url,
        contentType: 'application/json',
        dataType: "json",
        success: function (data) {
            successFunction(team, specialIdentifier, data.issues);
        }
    });
}

function calculateIssueSum(issues) {
    var sumEstimate = 0;

    AJS.$.each(issues, function (index, issue) {
        sumEstimate += issue.fields.timeoriginalestimate / 28800; //from millis to PT
    });

    return Math.round(sumEstimate * 100) / 100;
}

/* For a given date, get the ISO week number
 *
 * Based on information at:
 *
 *    http://www.merlyn.demon.co.uk/weekcalc.htm#WNR
 *
 * Algorithm is to find nearest thursday, it's year
 * is the year of the week number. Then get weeks
 * between that date and the first day of that year.
 *
 * Note that dates in one year can be weeks of previous
 * or next year, overlap is up to 3 days.
 *
 * e.g. 2014/12/29 is Monday in week  1 of 2015
 *      2012/1/1   is Sunday in week 52 of 2011
 */
function getWeekNumber(d) {
    // Copy date so don't modify original
    d = new Date(+d);
    d.setHours(0, 0, 0);
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    // Get first day of year
    var yearStart = new Date(d.getFullYear(), 0, 1);
    // Calculate full weeks to nearest Thursday
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1) / 7);
    // Return array of year and week number
    return [d.getFullYear(), weekNo];
}

var Report = {};
Report.init = init;
window.Report = Report;
