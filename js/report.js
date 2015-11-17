var epicsPerTeam = {},
    baseEpicFilter,
    table
    statusIndicatorBaseUrl = "http://jira.swisscom.com/download/resources/de.polscheit.jira.plugins.traffic-light_status:resources/images/status_{status}18.png",
    rows;

function init(newBaseEpicFilter) {
    baseEpicFilter = newBaseEpicFilter;
    startReportGeneration();
}

function startReportGeneration() {
    resetTable();

    var getAllEpicsForTeams = "http://jira.swisscom.com/rest/api/2/search?maxResults=500&jql=filter=" + baseEpicFilter;
    return ajaxCall(getAllEpicsForTeams, fetchRelevantEpicInformations);
}

function prepareTable() {
    if (jQuery.fn.dataTable.isDataTable('#myTable')) {
        table.destroy();
    }

    table = jQuery('#myTable').DataTable({
        "order": [[0, "asc"]],
        "iDisplayLength": 50
    });
}

function resetTable() {
    epicsPerTeam = {};
    if (table) {
        table.destroy();
    }
    jQuery("#myTable tbody").empty();
}

function prepareTableRow(team, epic, sumForEpic) {
    var epicKey = epic.key;
    var tableBody = jQuery("#myTable tbody");
    tableBody.append("<tr id='" + epicKey + "'></tr>");
    var tableRow = jQuery("#" + epicKey);
    tableRow.append("<td>" + team + "</td>"); //team
    tableRow.append("<td>" + epic.fields.status.name + "</td>"); //epic status
    tableRow.append("<td><a href='http://jira.swisscom.com/browse/" + epicKey + "'>" + epicKey + "</a></td>"); //epic key (SAM-***)
    tableRow.append("<td><a href='http://jira.swisscom.com/browse/" + epicKey + "'>" + epic.fields.summary + "</a></td>"); // epic summary
    var solutionDesigner = epic.fields.customfield_17052 != null ? epic.fields.customfield_17052 : "None"; // SD
    tableRow.append("<td><a href='http://jira.swisscom.com/secure/ViewProfile.jspa?name=" + solutionDesigner.key + "'>" + solutionDesigner.displayName + "</a></td>");
    var devSpoc = epic.fields.customfield_17053 != null ? epic.fields.customfield_17053 : "None"; // SPOC
    tableRow.append("<td><a href='http://jira.swisscom.com/secure/ViewProfile.jspa?name=" + devSpoc.key + "'>" + devSpoc.displayName + "</a></td>");
    var labels = tableRow.append("<td class='labels'><div class='labels-wrap value'><ul id='" + epicKey + "_labels' class='labels'></div></td>"); //Labels on Epic
    var labelUl = jQuery(labels.find("#" + epicKey + "_labels"));
    jQuery.each(epic.fields.labels, function (index, label) {
        labelUl.append("<li><a class='lozenge' href = 'http://jira.swisscom.com/secure/IssueNavigator.jspa?reset=true&amp;jqlQuery=labels=" + label + " title='" + label + "'><span>" + label + "</span></a></li>");
    });

    tableRow.append("<td>" + Math.round((sumForEpic / 28800) * 100) / 100 + "</td>");

    tableRow.append("<td><img id='status_" + epicKey + "' src='" + statusIndicatorBaseUrl.replace("{status}", epic.fields.customfield_17554) + "'/></td>"); //Report state
    jQuery("#status_" + epicKey).click(epic, function (ev) {
        //on click we do two things:
        // 1. simply change the image url to display the new state
        // 2. do an ajax get to set the actual new state on the epic

        var element = jQuery(ev.target);
        var newState;
        if (hasElementGivenState(element, "green")) {
            element.attr("src", element.attr("src").replace("green", "yellow"));
            newState = "16549"; //yellow
        } else if (hasElementGivenState(element, "yellow")) {
            element.attr("src", element.attr("src").replace("yellow", "red"));
            newState = "16548"; //red
        } else if (hasElementGivenState(element, "red")) {
            element.attr("src", element.attr("src").replace("red", "green"));
            newState = "16550"; //green
        }
        updateEpicState(epic, newState);
    });
    tableRow.append("<td>" + epic.fields.customfield_17650 === null ? "" : epic.fields.customfield_17650 + "</td>"); //Report detail

    if (rows && jQuery(tableBody.find("tr")).length === rows) {
        prepareTable();
        gadget.resize();
    }
}

function hasElementGivenState(element, stateToCheck) {
    return element.attr("src").indexOf(stateToCheck) != -1
}

function updateEpicState(epic, newState) {
    jQuery.ajax({
        url: "http://jira.swisscom.com/secure/AjaxIssueAction.jspa?decorator=none&customfield_17554=" + newState + "&issueId=" + epic.id + "&singleFieldEdit=true&fieldsToForcePresent=customfield_17554",
        headers: {
            "X-Atlassian-Token": "no-check"
        },
        type: "GET"
    });
}

function fetchRelevantEpicInformations(issues) {
    rows = issues.length;
    var groupedIssuesByTeam = _.groupBy(issues, function (issue) {
        return issue.fields.customfield_14850.value;
    });

    jQuery.each(_.keys(groupedIssuesByTeam), function (index, currentTeam) {
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

        jQuery.each(sortable, function (index, epic) {
            var getIssuesForEpicsUrl = "http://jira.swisscom.com/rest/api/2/search?maxResults=500&jql='Epic Link' in (" + epic.key + ") and status != Closed";

            return jQuery.ajax({
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
    jQuery.each(issues, function (index, issue) {
        sum += issue.fields.timeoriginalestimate;
    });
    prepareTableRow(team, epic, sum);
}

function ajaxCall(url, successFunction) {
    return jQuery.ajax({
        url: url,
        contentType: 'application/json',
        dataType: "json",
        success: function (data) {
            successFunction(data.issues);
        }
    });
}

var Report = {};
Report.init = init;
window.Report = Report;
