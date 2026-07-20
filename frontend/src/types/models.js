/** @typedef {{id:string,username:string,email:string}} User */
/** @typedef {{accessToken:string,refreshToken:string,user?:User}} AuthResponse */
/** @typedef {{name?:string,phone?:string,address?:string,nationality?:string,languages?:string[],gender?:string,dateOfBirth?:string,profileImage?:string}} Profile */
/** @typedef {{id:string,name:string,phone:string,relationship:string,isPrimary?:boolean}} EmergencyContact */
/** @typedef {{id:string,title:string,body:string,type:string,read:boolean,createdAt:string}} Notification */
/** @typedef {{id:string,destination:string,eta:string,status:string,startedAt:string,lastLocation:Location,timeline:Array}} Journey */
/** @typedef {{id:string,status:string,triggeredAt:string,location:Location,details?:string}} SOSEvent */
/** @typedef {{bloodGroup?:string,allergies?:string,medicalConditions?:string,currentMedications?:string,doctorName?:string,doctorPhone?:string,additionalNotes?:string,organDonor?:boolean,wheelchairRequired?:boolean}} MedicalInformation */
/** @typedef {{shareLiveLocation?:boolean,autoSOS?:boolean,silentSOS?:boolean,receiveWeatherAlerts?:boolean,receiveDangerZoneAlerts?:boolean,locationUpdateInterval?:number,preferredLanguage?:string}} EmergencySettings */
/** @typedef {{latitude:number,longitude:number,address?:string,updatedAt?:string}} Location */
export {};
