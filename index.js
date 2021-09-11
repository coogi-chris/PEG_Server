const functions = require('firebase-functions');
const admin = require("firebase-admin");
const nodemailer = require('nodemailer');
var dateFormat = require('dateformat');
var accountSid = 'ACac3eb67b1a80773bfcd2e46bbdsdfsdfsd2e2b86'; // Your Account SID from www.twilio.com/console
var authToken = '8dc0eeasdvsdvsdv56e93b10693223e5f65ec52deb8a9';   // Your Auth Token from www.twilio.com/console
var twilio = require('twilio');
var client = new twilio(accountSid, authToken);
var apn = require('apn');
var app = admin.initializeApp({
  serviceAccountId: 'firebase-adminsdk-4he6k@please-eat-good-f902f.iam.gserviceaccount.com',
});
const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const plaid = require('plaid');
const moment = require("moment");
var APP_FEE = 1000;
const request = require('request');
var CronJob = require('cron').CronJob;

const settings = {
        token: {
            key: fs.readFileSync('./certs/AuthKey_A6Y67SXHHB.p8'), 
            keyId: 'A6Y6D7SXHHB',
            teamId: 'PV997AN5427',
        },
        production: false
};
var apnProvider = new apn.Provider(settings);

const db = admin.firestore();
const profileCollectionRef = db.collection('Profiles');



exports.queryRecipes = functions.https.onCall(async (data, context) => {
	const userId = context.auth.uid
	const name = data.name;

	try {
		const foods = await getFoodByName(name);
		return foods;
	}catch(err) {
		throw err;
	}
})

async function getFoodByName(name) {
	const url = `https://api.edamam.com/search?q=${name}&app_id=5a06e141&app_key=03d09ceec5e41b7bef3f6bee8001658b`;
	return new Promise(function(res, rej){
		request(url, function (error, response, body) {
			if(error) {
				rej(err)
			}else{
				const _body = JSON.parse(body);
				res(_body)
			}
		});
	})
}


function getProfile(userID) {
	let profileRef = profileCollectionRef.doc(userID);
	return new Promise(function(resolve, reject){
		return profileRef.get().then(profile => {
			if(!profile.exists){ return reject(new functions.https.HttpsError('invalid-argument', 'Profile doesnt exist')) }
			const profileData = profile.data()
			return resolve(profileData)
		})
	})
}

function note(title,message, payload) {
	var note = new apn.Notification();
	note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
	note.badge = 3;
	note.sound = "ping.aiff";
	note.title = title;
	note.alert = message;
	note.payload = payload || {};
	note.topic = "com.eat.good.please";
	return note;	
}

exports.sendNotification = functions.https.onRequest(async (req, res) => {
    const deviceID = req.query.deviceID || "0";
    const message = req.query.message || "No Message"

    const _res = res;

    try{
    	const noteRes = await apnProvider.send(note("",message), deviceID)
    	res.send(noteRes)
    }catch(err){
    	console.log(err)
    	throw err
    }
	
});

exports.sendNotificationPushAlert = functions.firestore
    .document('Profiles/{uid}/notifications/{notificationID}')
    .onCreate(async (snap, context) => {
    	const uid = context.params.uid
    	const data = snap.data();
    	const profilePrivate = await getProfile(uid);
    	await updateProfile(uid, {newNotifications:true}); // lets the user know there's a new notifications.
    	if(profilePrivate){
    		if(profilePrivate.deviceToken && profilePrivate.deviceToken.length && data.sendPushNotification){
    			const noteRes = await apnProvider.send(note(data.title, data.body, data.payload), profilePrivate.deviceToken)
    			console.log('NOTE RES: ', noteRes)
    		}else{
    			console.log("Cant send notification");
    		}
    	}else{
    		console.log('No profile to send notification.');
    	}
});

async function createNotification(userID, title, body, iconURL, collectionName, documentID, sendPushNotification, payload, isHidden) {
	const notifications = profileCollectionRef.doc(userID).collection("notifications");
	const date = admin.firestore.Timestamp.fromMillis(Date.now());	
	const documentResponse = await notifications.add({title:title, body:body, iconURL:iconURL, created:date, "collectionName":collectionName || "general", "documentID":documentID, "sendPushNotification":sendPushNotification || false, payload:payload || {}, isHidden:isHidden});
	const docSnapshot = await documentResponse.get();
	var snapShotData = docSnapshot.data();
	return snapShotData
}

exports.setUserProfile = functions.https.onCall(async (data, context) => {

	const userId = context.auth.uid

	let profileRef = profileCollectionRef;
	let appointmentDoc = profileRef.doc(userId);

	const dateString = data.dob;
	const dateObj = new Date(dateString);

	data["dob"] = admin.firestore.Timestamp.fromDate(dateObj);

	try {
		await updateProfile(userId, data);

		const profile = await getProfile(userId);

		var now = new Date();
		var next = AddMinutesToDate(now,2);
		const job = new CronJob(next, function() {
			const d = new Date();
			// function createNotification(userID, title, body, iconURL, collectionName, documentID, sendPushNotification, payload, isHidden)
			createNotification(userId, "Track Nutrients", "Thanks for signing up for PEG. Start adding food to your list.", "iconURL", "colName", "documentID", true, null, false);
		});
		
		job.start();

		return profile;
	}catch(err) {
		throw err;
	}
});

function AddMinutesToDate(date, minutes) {
     return new Date(date.getTime() + minutes*60000);
}``

function updateProfile(userID, customerObj) {
	let profileRef = profileCollectionRef
		.doc(userID)
	return profileRef.set(customerObj, { merge:true })	
}

function sendEmail(email, subject, body) {

	const transporter = nodemailer.createTransport({
	  service: 'gmail',
	  auth: {
	    user: 'chris.kendricks07@gmail.com',
	    pass: 'jckzyowhikpvbqmc' // naturally, replace both with your real credentials or an application-specific password
	  }
	});

	const mailOptions = {
	  from: 'chris.kendricks07@gmail.com',
	  to: email,
	  subject: subject,
	  html: body
	};
	return new Promise(function(resolve, reject){
		transporter.sendMail(mailOptions, function(error, info){
		  if (error) {
			reject(new functions.https.HttpsError('invalid-argument', error.message));
		  } else {
		    resolve(info.response);
		  }
		});
	})
}

var toLocalTime = function(time) {
  var d = new Date(time);
  var offset = (new Date().getTimezoneOffset() / 60) * -1;
  var n = new Date(d.getTime() + offset);
  return n;
};

function sendSubscriptionEmail(email, subject, date, meetingLink, title) {

		const longDate = dateFormat(date, "fullDate", true);
		const shortTime = dateFormat(toLocalTime(date), "longTime");

		var html = `<!DOCTYPE html>
			<html>
				<head>
					<meta name="x-apple-disable-message-reformatting" />
					<style type="text/css">
						body {
							margin: 0;
							font-family: 'arial';
							line-height: 20px !important;
							font-family: 'arial';
							font-weight: 300;
						}
						a {
							color: #3491bb;
							text-decoration: none !important;
						}
						a i {
							color: #3491bb;
						}

						.logos {
							list-style:none;
							padding: 0;

						}
						.logos li {
							margin-bottom: 35px;
						}

						hr {
							width: 100%;
							border: none;
							background-color: #e4e4e4; 
							height: 1px; margin-bottom: 30px;
						}

						h2 span {
							font-size: 10px;
						    color: #666;
						}

						.font-light {
							font-weight: lighter;
						}

						.list i {
							font-size: 12px;
							margin-right: 5px;
						}

						.list li {
							font-size: 14px;
						}

						.txt-white {
							color: #FFF;
						}


						.btn-primary {
							display: inline-block;
							background: #5BC8FA;
							color: #FFF;
							padding: 10px 20px;
							min-width: 100px;
							text-align: center;
							text-decoration: none;
							border-radius: 5px;
							font-size: 20px;
							font-weight: bold;
							font-size: 17px;
						    letter-spacing: 2px;

						}
						.container {
							max-width: 1024px !important;
							margin:0 auto;
							background: #FFF;
							padding: 20px;
							border-radius: 5px;
							margin-bottom: 30px;
							box-shadow: 1px 1px 20px rgb(23 123 185 / 50%);
						}
						#logo {
							max-width: 600px;
							position: relative;
							top: 20px;
							width: 100%;
						}
						#header {
							background: #000000;
			    			text-align: center;
			    			height: 123px;
						}
						#header nav {
							padding: 20px;
						}
						#header a {
							color: #FFF;
							text-decoration: none;
							padding:10px;
							font-size: 20px;
						}
						.panel {
							background: #f7f7f7;
							padding: 20px;
							color: #000;
							border-radius: 15px;
							border:thin solid #e0e0e0;
							margin-bottom: 15px;
							box-shadow: 1px 1px 1px rgb(241 241 241);
						}


						#logo-bottom {
							text-align: center;
						}
						#logo-bottom img {
							width: 100%;
							max-width: 600px;
						}

						.right-col {
							float: left; width: 60%; float: left;
											width: 49%;
											margin-left: 5%;border-left: thin solid #e4e4e4;
						    padding-left: 30px
						}

						.price > * {
							margin: 0;
							margin-bottom: 10px;
						}
						.price h1 {

						}
						.price-container .price {
							width: 33%;
							text-align: center;
						}
						
					</style>
				</head>
				<body>
					<div>
						<div class="container" style="padding: 30px; line-height: normal; padding: 0;border-radius: 0; box-shadow: none;">
							<div class="col" style="width: 100%;">
								<img width="100%" src="https://www.afroacademy.org/email_header.jpg" style="width: 100%;">
								<div style="text-align: center;">
									<h1 style="font-size: 40px; margin-top: 30px; margin-bottom: 0;">You're enrolled!</h1>
								</div>
								<div style="padding: 30px; padding-top: 0;">
									<p>Congratulations!</p>
									<p>You've been enrolled into <strong>${title}</strong> with Afro Academy. </p>
									<hr>
									<p><strong>Start date:</strong></p>
									<p>Open Afro Academy mobile app to view your start date and time.</p>
									<p><strong>Class link:</strong></p>
									<p><strong> <a href="${meetingLink}">${meetingLink}</a></strong></p>
									
								</div>
							</div>
					</div>
				</body>
			</html>`;

 	sendEmail(email, subject, html);	
}











