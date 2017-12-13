var express = require('express');
var app = express();
//block header from containing info about server
app.disable('x-powered-by'); 
// Set up Handlebars
// Create a directory named views and then another named layouts in it
// Define main.handlebars as the default layout
var handlebars = require('express-handlebars').create({defaultLayout:'main'});
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');



var server = require('http').createServer(app);
var https = require('https');
var httpsPort = 3443;
// Required when sending RESTful HTTP Request
// npm install --save request
var request = require('request');
// Required when reading or writing streaming files
// Included in Express
var fs = require('fs');
// Server Address: loclhost:3000
var port = 3000;
var hostname = '127.0.0.1';
// Required when using POST to parse encoded data
// npm install --save body-parser
var bodyParser = require('body-parser');
// Formidable is required to accept file uploads
// npm install --save formidable
var formidable = require('formidable');

// Create a directory called public and then a directory
// named img inside of it and put logo in there
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());
app.use(express.json());
// Required for Sign In Function
// Get User Token and Token From Cognito
var AWS = require('aws-sdk');
var AWSCognito = require('amazon-cognito-identity-js');

// PEM pass phrase: testtest
var privateKey = fs.readFileSync('sslcert/key.pem','utf8');
var certificate = fs.readFileSync('sslcert/cert.pem','utf8');
var credentials = {
	requestCert: false,
	rejectUnauthorized: false,
	key: privateKey, 
	cert: certificate, 
	passphrase: 'testtest'};
var httpsServer = https.createServer(credentials, app);
// Global Variables
var UserCognito;
var token;

var endpoint = 'https://rgsghi9075.execute-api.us-west-2.amazonaws.com/prod';

// Sign In
app.get('/signin', function(req, res){
	console.log('https server sign in');
	res.sendFile(__dirname + '/public/signin.html');
});

// Acquire User Name and Password and transmit to Cognito
app.post('/postuserid', function(req, res, next){
	var user = req.body.username;
	var pw = req.body.pw;
	console.log("User: " + user);
	console.log("Password: " + pw);
	var authenticationData = {
		Username : user,
		Password : pw,
	};
	var poolData = { 
		UserPoolId : 'us-west-2_EMrBUAB7P',
		ClientId : '1sk2und7j5i59c6m5adev9veel'
	};
	var userPool = new AWSCognito.CognitoUserPool(poolData);
	var userData = {
		Username : user,
		Pool : userPool
	};
	var authenticationDetails = new AWSCognito.AuthenticationDetails(authenticationData);
	var cognitoUser = new AWSCognito.CognitoUser(userData);
	cognitoUser.authenticateUser(authenticationDetails, {
		onSuccess: function (result) {
			//console.log('access token + ' + result.getAccessToken().getJwtToken());
			/*Use the idToken for Logins Map when Federating User Pools with Cognito Identity 
			or when passing through an Authorization Header to an API Gateway Authorizer*/
			//console.log('idToken + ' + result.idToken.jwtToken);
			token = result.idToken.jwtToken;                     // Get Token
			UserCognito = result.getAccessToken().getJwtToken(); // Get User Token
			res.send('Sign In Success');                         // Direct to Home Page
		},
		onFailure: function(err) {
			console.log(err);
		},
	});
});

//UserCognito = 'yky';
//token = '';

// Home Page
// Query Dynamo DB to get all tasks assigned to current user
// And display in Grid View
app.get('/', function (req, res,next) {
	var QueryForTask = {
			url: endpoint + '/get-task',                 //Lambda Function Url
			method: 'POST',
			headers: {'Content-Type':'application/json','Authorization': token},
			json: true,
			body: {"user":UserCognito}             // Required Field: Username
		}
	request(QueryForTask, function (error, response, body) {
		if (!error && response.statusCode == 200) {
        	console.log('Task Number: ' + body.Count);
        	var toSend = JSON.stringify({"items":body.Items}); // Stringify items before sending
        	res.render('home',{number: body.Count, info: toSend});
        	// Point at the home.handlebars view
        	// number: number of tasks
        	// info: all information of tasks, display task name and description on the view
    	}
	});  	
	next();
},function(req,res){
	console.log('Open Home Page');
});

// Create New Task
app.get('/create', function(req,res,next){
	// Point at the create.handlebars view
	res.render('create');
	// Parameters to be collected:
	// Task Name; Project Name; Deadline; Status; Assignee; Description
	// After completed, redirect to home page.
});

// View Task Details
// Query Dynamo DB for by Specific Task Name
// QUery S3 for the name of All files of this task
app.get('/task/:taskname',function(req, res, next){
	var task;
	var querytaskname = decodeURI(req.path).split("/")[2];
	var QueryForTaskName = {
			url: endpoint + '/get-task',                  //Lambda Function Url
			method: 'POST',
			headers: {'Content-Type':'application/json','Authorization': token},
			json: true,
			body: {"user":UserCognito,"task":querytaskname} 
			// Required Field: Username; Task Name
		}
	// Query Dynamo DB for by Specific Task Name
	request(QueryForTaskName, function (error, response, body) {
		if (!error && response.statusCode == 200) {
        	console.log("View in Detail: " + body.Items[0].Task);
        	task = body.Items[0];            // Get the information of queried task
        	var QueryForFileName={
        		url: endpoint + '/list-files',                //Lambda Function Url
        		method: 'POST',
        		headers: {'Content-Type':'application/json','Authorization': token},
        		json: true,
        		body: {"user":UserCognito,"task":querytaskname}
        		// Required Field: Username; Task Name
        	}
        	// QUery S3 for the name of All files of this task
        	request(QueryForFileName, function (error, response, body) {
        		if (!error && response.statusCode == 200) {
        		var toSendFileName = JSON.stringify({"filename":body});
        		var NumOfFile = body.length;
        		console.log(body);
        		//console.log(body);
        		//task = body.Items[0];

        		// Parameters needed for Detail page:
				// Task Name; Project Name; Deadline; Status; Assignee; Description;
				// Uploaded File Name; Uploaded File Number
        		res.render('taskdetail',{ 
        			TaskName: task.Task,
        			ProjectName: task.Team,
        			Deadline: task.Deadline,
        			Assignee: task.Assignees,
        			Status: task.Status,
        			Description: task.Description,
        			LinkNumber: NumOfFile,
        			FileName: toSendFileName
        		}); 
        	}
        });
        }
	});
  	next();
  },function(req, res){
  	console.log('Open Task Detail');
  });

app.get('/download/:taskname/:filename', function(req, res, next){
	var tn = decodeURI(req.path).split("/")[2];
	var fn = decodeURI(req.path).split("/")[3];
	console.log('Download File: '+fn);
	var QueryForFile = {
			url: endpoint + '/open-file',
			method: 'POST',
			headers: {'Content-Type':'application/json','Authorization': token},
			json: true,
			body: {"task":tn,"filename":fn}
		}
	request(QueryForFile, function (error, response, body) {
		if (!error && response.statusCode == 200) {
        	console.log(body);
        	//console.log(body);
        	var text_data = body;
        	res.writeHead(200, {
        		'Content-Type': 'application/force-download',
        		'Content-disposition':'attachment; filename='+fn
        	});
        	res.end(text_data);
        	// var path = __dirname + '/' + fn;
        	// fs.writeFileSync(path, body, function(err){
        	// 	if(err){
        	// 		console.log(err);
        	// 	}
        	// 	console.log("File Saved");
        	// });
    	}
	});

});

var User;
var Current_TaskName;
var Current_ProjectName;
var Current_Deadline;
var Current_Assignee;
var Current_Description;
var Current_Status;

app.post('/modify',function(req, res, next){
 	res.send('Complete Posting Modify');
 	Current_TaskName = req.body.ModifyTaskName;
 	Current_ProjectName = req.body.ModifyProjectName;
 	Current_Deadline = req.body.ModifyDeadline;
 	Current_Assignee = req.body.ModifyAssignee;
 	Current_Description = req.body.ModifyDescription;
 	Current_Status = req.body.ModifyStatus;

 	next();
 	},function(req, res){
 	// res.render('home',{
 	// 	number: 2,
 	// 	title: 'Express'
 	 	// });
 	console.log(Current_TaskName);
 	console.log('Open Modify Task'); 
 });

app.get('/modify', function(req, res, next){
	res.render('modify',{
		ModifyTaskName: Current_TaskName,
		ModifyProjectName: Current_ProjectName,
		ModifyDeadline: Current_Deadline,
		ModifyAssignee: Current_Assignee,
		ModifyDescription: Current_Description,
		ModifyStatus: Current_Status
	});
});




app.post('/postcreatetask', function(req, res, next){
   //res.send("You just called the post method at '/hello'!\n");
   Create_TaskName = req.body.TaskName;
   Create_ProjectName = req.body.ProjectName;
   Create_Deadline = req.body.Deadline;
   Create_Assignee = req.body.Assignee;
   Create_Description = req.body.Description;
   Create_Status = req.body.Status;
   var options = {
   	url: endpoint + '/create-task',
    method: 'POST',
    headers: {'Content-Type':'application/json','Authorization': token},
    json: true,
    body: {"UserId": UserCognito,"Deadline": Create_Deadline,"Task": Create_TaskName,"Team": Create_ProjectName,
    "Description": Create_Description,"Assignees": Create_Assignee,"Status": Create_Status}
}
   request(options, function (error, response, body) {
    if (!error && response.statusCode == 200) {
    	console.log(req.body);
        console.log(body);
        //return res.redirect(303,'/');
        //next();
        //Redirect to HomePage
        res.send('Complete Post Create Task');
    }
});
});


app.post('/deletetask', function(req, res, next){
	var Delete_TaskName = req.body.DeleteTaskName;
	var QueryFroDelete = {
		url: endpoint + '/delete-task',
    	method: 'POST',
    	headers: {'Content-Type':'application/json','Authorization': token},
    	json: true,
    	body: {"user": UserCognito,"task": Delete_TaskName}
	}
	//Send Delete Request to Dynamo DB
	request(QueryFroDelete, function (error, response, body) {
		if (!error && response.statusCode == 200) {
        	console.log('Delete Task: ' + Delete_TaskName);
        	console.log(body);
        	res.send("Delete Success");
    	}
	});  

});

app.post('/upload/:taskname', function(req, res){
	var upload_taskname = decodeURI(req.path).split("/")[2];
	var form = new formidable.IncomingForm();
	form.parse(req, function(err, fields, files){
		var file = files.file;
		var name = file.name;
      	if(err)
        	return res.redirect(303, '/error');
      	console.log('Received File: ' + name);
      	//console.log(file);
      	var text = fs.readFileSync(file.path).toString('utf-8');
      	//res.redirect(303, '/error');
      	console.log(text);
      	var QueryForUpload = {
      		url: endpoint + '/upload-file',
    		method: 'POST',
    		headers: {'Content-Type':'application/json','Authorization': token},
    		json: true,
    		body: {"user": UserCognito, "task": upload_taskname,"filename": name,"data": text}
    	}
    	request(QueryForUpload, function (error, response, body) {
		if (!error && response.statusCode == 200) {
        	console.log('Upload File: ' + upload_taskname);
        	console.log(body);
        	//res.send("Delete Success");
        	res.redirect(303, '/task/'+upload_taskname);
    	}
	});  
      // Output file information
  	});
      //res.redirect( 303, '/thankyou');
});


app.get('/error', function(req, res, next){
	res.render('error');
});

// Custom 500 Page
app.use(function(err, req, res, next) {
  console.error(err.stack);
  res.status(500);
  // Point at the 500.handlebars view
  res.render('500');
});

// Defines a custom 404 Page and we use app.use because
// the request didn't match a route (Must follow the routes)
app.use(function(req, res) {
  // Define the content type
  res.type('text/html');
  // The default status is 200
  res.status(404);
  // Point at the 404.handlebars view
  res.render('404');
});

 server.listen(port, hostname, () => {
 	console.log('Server started on port '+ port);
 });

httpsServer.listen(httpsPort, hostname, ()=>{
	console.log('Https Server started on port ' + httpsPort);
});
