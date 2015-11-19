var epicsPerTeam = {},
    baseEpicFilter,
    statusIndicatorBaseUrl = "http://jira.swisscom.com/download/resources/de.polscheit.jira.plugins.traffic-light_status:resources/images/status_{status}18.png",
    rows;

function init(newBaseEpicFilter, newTableId) {
    baseEpicFilter = newBaseEpicFilter;
    startReportGeneration(newTableId);
}

function startReportGeneration(tableId) {
    initTable();
    epicsPerTeam = {};

    return jQuery.ajax({
        url: "http://jira.swisscom.com/rest/api/2/search?maxResults=500&jql=filter=" + baseEpicFilter,
        contentType: 'application/json',
        dataType: "json",
        success: function (data) {
            fetchRelevantEpicInformations(tableId, data.issues);
        }
    });
}

function prepareTable(tableId) {
    jQuery('#' + tableId).DataTable({
        "order": [[0, "asc"]],
        "searching": false,
        "lengthMenu": [[10, 15, 25, -1], [10, 15, 25, "All"]],
        "iDisplayLength": 15
    });

    jQuery('#' + tableId).on('draw.dt', function () {
        gadget.resize();
    });
}

function initTable() {
    var tableHead = jQuery('#' + tableId + " thead");
    addTableHeader(tableHead, 5, "Team");
    addTableHeader(tableHead, 5, "Status");
    addTableHeader(tableHead, 5, "Key");
    addTableHeader(tableHead, 20, "Summary");
    addTableHeader(tableHead, 10, "SD");
    addTableHeader(tableHead, 10, "SPOC");
    addTableHeader(tableHead, 5, "Labels");
    addTableHeader(tableHead, 10, "Progress");
    addTableHeader(tableHead, 5, "Report State");
    addTableHeader(tableHead, 25, "Report Detail");
}

function addTableHeader(tableHead, width, label) {
    tableHead.append('<th style="width: ' + width + '%">' + label + '</th>');
}

function prepareTableRow(tableId, team, epic, sumAll, sumRemaining) {
    var epicKey = epic.key;
    var tableBody = jQuery("#" + tableId + " tbody");
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

    var percentageComplete = 100 - (sumRemaining / sumAll) * 100;
    percentageComplete = Math.round(percentageComplete * 100) / 100;


    tableRow.append("<td><div title='" + percentageComplete + "%' class='progress'><div class='progress-bar' style='width: " + percentageComplete + "%'><span class='sr-only'></span></div></div></td>");

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
    tableRow.append("<td><a href='#' id='report_detail_" + epic.key + "'>" + percentageComplete + "% " + (epic.fields.customfield_17650 === null ? '' : epic.fields.customfield_17650) + "</a></td>"); //Report detail

    jQuery('#report_detail_' + epic.key).editable({
        type: 'textarea',
        placement: "left",
        pk: jQuery(tableBody.find("tr")).length,
        url: "http://jira.swisscom.com/rest/api/2/issue/" + epic.key,
        params: function (params) {
            return JSON.stringify({'fields': {'customfield_17650': params.value}});
        },
        ajaxOptions: {
            type: "PUT",
            contentType: 'application/json',
            dataType: "json"
        },
        title: 'Update report detail:'
    });

    if (rows && jQuery(tableBody.find("tr")).length === rows) {
        prepareTable(tableId);
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

function fetchRelevantEpicInformations(tableId, issues) {
    rows = issues.length;
    var groupedIssuesByTeam = _.groupBy(issues, function (issue) {
        var team = issue.fields.customfield_14850;
        if (team === null) {
            return "NotYetDefined";
        }
        return team.value;
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
            var getIssuesForEpicsUrl = "http://jira.swisscom.com/rest/api/2/search?maxResults=500&jql='Epic Link' in (" + epic.key + ")";

            return jQuery.ajax({
                url: getIssuesForEpicsUrl,
                contentType: 'application/json',
                dataType: "json",
                success: function (data) {
                    return calculateRemainingEstimateForMileStone(tableId, currentTeam, epic, data.issues);
                }
            });
        });
    });
}

function calculateRemainingEstimateForMileStone(tableId, team, epic, issues) {
    var sumAll = 0,
        sumRemaining = 0;
    jQuery.each(issues, function (index, issue) {
        if (issue.fields.status.name !== "Closed") {
            sumRemaining += issue.fields.timeoriginalestimate;
        }

        sumAll += issue.fields.timeoriginalestimate;
    });
    prepareTableRow(tableId, team, epic, sumAll, sumRemaining);
}

var Report = {};
Report.init = init;
window.Report = Report;
