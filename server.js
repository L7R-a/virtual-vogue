const express = require('express');
var nodemailer = require('nodemailer');
const app = express();
app.use(express.json());

const cors = require("cors");
app.use(cors());

const bodyParser = require('body-parser');
app.use(bodyParser.json());

const path = require("path");
const PORT = process.env.PORT || 5001;

// Allow ".env" to be used
require("dotenv").config();

const cloudinary = require("./utils/cloudinary");
const upload = require("./middleware/multer");

// Connect to MongoDB
const { MongoClient } = require("mongodb");
const url = process.env.ATLAS_URI;
console.log(url);
const client = new MongoClient(url, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
client.connect(console.log("mongodb connected"));
const db = client.db("VirtualCloset");
const ObjectId = require('mongodb').ObjectId;   // Get ObjectId type

// Run Server
app.listen(PORT, () =>
{
    console.log(`Server is running on port: ${PORT}`);
});

// Headers
app.use((req, res, next) =>
{
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PATCH, DELETE, OPTIONS'
    );
    next();
});

// Login API Endpoint
app.post('/api/Login', async (req, res, next) =>
{
    // incoming: login, password
    // outgoing: userId, firstName, lastName, email, verified (isVerified), error

    var error = '';
    var id = -1;
    var fn = '';
    var ln = '';
    var em = '';
    var vr = false;

    try {
        const { login, password } = req.body;
        const results = await db.collection('Users').find({Login:login,Password:password}).toArray();
    
        if( results.length > 0 )
        {
            id = results[0]._id;
            fn = results[0].FirstName;
            ln = results[0].LastName;
            em = results[0].Email;
            vr = results[0].isVerified;
        }

        if ( id == -1 ) {
            error = "User or password is incorrect"
        }
    }
    catch(e)
    {
        error = e.toString();
    }

    var ret = { userId:id, firstName:fn, lastName:ln, email:em, verified:vr, error:error };
    res.status(200).json(ret);
});

// Register API Endpoint
app.post('/api/Register', async (req, res, next) =>
{
    // incoming: login, password, firstName, lastName, email
    // outgoing: userId, error

    const { login, password, firstName, lastName, email } = req.body;

    const newUser = {Login:login,Password:password,FirstName:firstName,LastName:lastName,Email:email,isVerified:false,Images: [],};
    var error = '';
    var id = -1;

    try
    {
        // check if username exists
        var results = await db.collection('Users').find({Login:login}).toArray();

        if ( results.length == 0 )
        {

            // check if email is already being used
            results = await db.collection('Users').find({Email:(email.toLowerCase())}).toArray();

            if ( results.length == 0 ) 
            {

                // insert user and retrive id
                results = await db.collection('Users').insertOne(newUser);
                if (results.acknowledged) 
                {
                    id = results.insertedId;
                }
            }
            else
            {
                error = "An account is already associated with this email";
            }
        }
        else 
        {
            error = "Username already exists";
        }
    }
    catch(e)
    {
        error = e.toString();
    }

    var ret = { userId:id, error:error };
    if(!error) sendVerificationEmail(email, ret.userId);
    res.status(200).json(ret);
});

// Update Password API Endpoint
app.post('/api/UpdatePass', async (req, res, next) =>
{
    // incoming: userId, newPassword
    // outgoing: error

    const { userId, newPassword } = req.body;

    const filter = { _id: new ObjectId(userId) };
    const updateDoc = {
        $set: {
            Password: newPassword
        },
    };
    const options = { upsert: false }

    var error = '';

    try
    {
        const results = await db.collection('Users').updateOne(filter, updateDoc, options);
    }
    catch(e)
    {
        error = e.toString();
    }

    var ret = { error: error };
    res.status(200).json(ret);
});

// Update isVerified API Endpoint
app.post('/api/UpdateVerification', async (req, res, next) =>
{
    // incoming: userId
    // outgoing: error
    const userId = req.body.userId;
    console.log("UserId: " + userId);
    const filter = { _id: new ObjectId(userId) };
    const updateDoc = {
        $set: {
            isVerified: true
        },
    };
    const options = { upsert: false }

    var error = '';

    try
    {
        const results = await db.collection('Users').updateOne(filter, updateDoc, options);
    }
    catch(e)
    {
        error = e.toString();
    }

    var ret = { error: error };
    res.status(200).json(ret);});

// Update Settings API Endpoint
app.post('/api/UpdateSettings/', async (req, res, next) =>
{
    // incoming: userId, firstName, lastName, email, login, password
    // outgoing: error

    const { userId,firstName,lastName,email,login,password } = req.body;

    const filter = { _id: new ObjectId(userId) };
    const updateDoc = {
        $set: {
            FirstName: firstName,
            LastName: lastName,
            Email: email,
            Login: login,
            Password: password
        },
    };
    const options = { upsert: false }

    var error = '';

    try
    {
        // check if username and email exists already
        const result1 = await db.collection('Users').find({Login:login}).toArray();
        const result2 = await db.collection('Users').find({Email:(email.toLowerCase())}).toArray();
        var userExists = true;
        var emailExists = true;

        if ( result1.length == 0 || (result1.length > 0 && result1[0]._id == userId) ) 
        {
            userExists = false;
        }

        if ( result2.length == 0 || (result2.length > 0 && result2[0]._id == userId) ) 
        {
            emailExists = false;
        }

        // Update error messages
        if (userExists == true && emailExists == true)
        {
            error = "Username and email are already in use";
        }
        else if (userExists == true) 
        {
            error = "Username already exists";
        }
        else if (emailExists == true) 
        {
            error = "An account is already associated with this email";
        }

        // Update settings
        else 
        {
            const results = await db.collection('Users').updateOne(filter, updateDoc, options);
        }
    }
    catch(e)
    {
        error = e.toString();
    }

    var ret = { error: error };
    res.status(200).json(ret);
});

const sendVerificationEmail = (email, userId) =>{
    var Transport = nodemailer.createTransport({
        service: "Gmail",
        auth:{
            user: process.env.emailSender,
            pass: process.env.emailPassword
        }
    });

    var mailOptions;
    let sender = "Virtual Vogue Team";
    mailOptions = {
        from: sender,
        to: email,
        subject: "Email Verification",
        html: `Click of the following link to verify your email. <a href=http://localhost:3000/verification-check?userId=${userId}> here </a>`
    };

    Transport.sendMail(mailOptions, function(error, respose){
        if(error){
            console.log(error);
        }
        else{
            console.log("Message sent");
        }
    });
}

const sendResetPasswodnEmail = (email, userId) =>{
    var Transport = nodemailer.createTransport({
        service: "Gmail",
        auth:{
          user: process.env.emailSender,
          pass: process.env.emailPassword
        }
    });

    var mailOptions;
    let sender = "Virtual Vogue Team";
    mailOptions = {
        from: sender,
        to: email,
        subject: "Reset Password",
        html: `Click of the following link to change your password. <a href=http://localhost:3000/resetpassword?userId=${userId}> here </a>`
    };

    Transport.sendMail(mailOptions, function(error, respose){
        if(error){
            console.log(error);
        }
        else{
            console.log("Message sent");
        }
    });
}

app.post('/api/findUser', async (req, res, next) =>
{
    // incoming: email
    // outgoing: boolean found or not

    var error = '';
    var found = false;

    try {
        const email = req.body.email;
        const results = await db.collection('Users').find({Email: email.toLowerCase()}).toArray();
        console.log(email);
        console.log(results.length);
        if( results.length > 0 )
        {
            found = true;
            sendResetPasswodnEmail(email,results[0]._id);
        }
        else {
            error = "User with this email doesn't exist";
        }
    }
    catch(e)
    {
        error = e.toString();
    }

    var ret = { found: found, error:error };
    res.status(200).json(ret);
});

// IMG handling
// Upload Image
// make file size of photos limiter and also maybe img compression
app.post("/api/Upload/:userId", upload.single("image"), async (req, res) => {
  try {
    const userId = req.params.userId;
    const tag = req.body.tag;

    // Upload image to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      tags: [tag],
    });

    // Save public ID to MongoDB
    //db.collection("Images").insertOne({ publicId: result.public_id });
    await db.collection("Users").updateOne(
      { _id: new ObjectId(userId) }, //userId being the object id in the MongoDb
      { $push: { Images: { publicId: result.public_id, tag: tag } } }
    );

    // Respond with success message and Cloudinary data
    res.status(200).json({
      success: true,
      message: "Uploaded!",
      data: result,
    });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({
      success: false,
      message: "Error uploading image, maybe file size too large? (Max 10 mb)",
      error: error.message,
    });
  }
});

// View a photo
// id is the public id
//<img src="https://res.cloudinary.com/${cloudinaryConfig.cloud_name}/image/upload/w_200,h_100,c_fill,q_100/${id}.jpg"></img>
app.get("/api/ViewImage/:id", async (req, res) => {
  const photoId = req.params.id;

  try {
    // Get image and construct the link using cloudinary
    const result = await cloudinary.api.resource(photoId);

    // if (image) then send URL as a response
    if (result) {
      const imageUrl = result.secure_url;
      res.status(200).json({
        success: true,
        imageUrl,
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }
  } catch (error) {
    console.error("Error retrieving image:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving image",
      error: error.message,
    });
  }
});

// fetch ALL the images associated to a user
app.get("/api/images/:userId", async (req, res) => {
  const userId = req.params.userId; // Get user ID from URL parameter

  try {
    // Retrieve user's images from MongoDB
    const user = await db
      .collection("Users")
      .findOne({ _id: new ObjectId(userId) });

    // If the user doesn't exist or has no images, return an empty response
    if (!user || !user.Images || user.Images.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No images found for the user." });
    }
    // Extract public IDs of images
    const imageIds = user.Images.map((image) => image.publicId);

    // Fetch images from Cloudinary using public IDs
    const { resources } = await cloudinary.api.resources_by_ids(imageIds, {
      tags: true,
    });

    // Extract image URLs or other relevant data
    const imageUrls = resources.map((image) => image.secure_url);

    // Respond with the images
    res.status(200).json({ success: true, images: imageUrls });
  } catch (error) {
    console.error("Error fetching images for user:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching images for user",
      error: error.message,
    });
  }
});

// fetch all the images by specific tag
app.get("/api/images/:userId/:tag", async (req, res) => {
  const userId = req.params.userId; // Get user ID from URL parameter
  const tag = req.params.tag; // Get tag from URL parameter

  try {
    // Retrieve user's images with the specified tag from MongoDB
    const user = await db
      .collection("Users")
      .findOne({ _id: new ObjectId(userId) });

    // If the user doesn't exist or has no images associated with the tag, return an empty response
    if (
      !user ||
      !user.Images ||
      user.Images.length === 0 ||
      !user.Images.some((image) => image.tag === tag)
    ) {
      return res.status(404).json({
        success: false,
        message: "No images found for the specified tag.",
      });
    }
    const filteredImages = user.Images.filter((image) => image.tag === tag);

    // Extract public IDs of filtered images
    const imageIds = filteredImages.map((image) => image.publicId);

    // Fetch images from Cloudinary using public IDs
    const { resources } = await cloudinary.api.resources_by_ids(imageIds, {
      tags: true,
    });

    // Extract image URLs or other relevant data
    const imageUrls = resources.map((image) => image.secure_url);

    // Respond with the images
    res.status(200).json({ success: true, images: imageUrls });
  } catch (error) {
    console.error("Error fetching images by user ID and tag:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching images by user ID and tag",
      error: error.message,
    });
  }
});

// Delete Image from a specific user using their objectId and imageId
app.post("/api/DeletePhoto/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const imageId = req.body.id;

    // actually delete the photo from cloudinary
    await cloudinary.uploader.destroy(req.body.id);

    // delete from db
    const deleteResult = await db.collection("Users").updateOne(
      { _id: new ObjectId(userId) }, //userId being the object id in the MongoDb
      { $pull: { Images: { publicId: imageId } } }
    );

    if (deleteResult.modifiedCount === 0) {
      throw new Error("Image not found in the database");
    }

    // response
    res.status(200).json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting image",
      error: error.message,
    });
  }
});

// Delete all photos off of a user

// Function to delete images associated with a user from Cloudinary
async function deleteImagesFromCloudinary(imageIds) {
  try {
    // Delete images from Cloudinary using their public IDs
    const deleteResults = await cloudinary.api.delete_resources(imageIds);

    // Return the delete results
    return deleteResults;
  } catch (error) {
    console.error("Error deleting images from Cloudinary:", error);
    throw error;
  }
}

// Endpoint to delete a user (and associated images) from the system
app.delete("/api/DeleteUser/:userId", async (req, res) => {
  const userId = req.params.userId; // Get user ID from URL parameter

  try {
    // Retrieve user's images from MongoDB
    const user = await db
      .collection("Users")
      .findOne({ _id: new ObjectId(userId) });

    // If the user doesn't exist, return a 404 Not Found response
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    // If the user exists and has images, delete them from Cloudinary
    if (user.Images && user.Images.length > 0) {
      const imageIds = user.Images.map((image) => image.publicId);
      await deleteImagesFromCloudinary(imageIds);
    }

    // Delete the user's document from MongoDB
    await db.collection("Users").deleteOne({ _id: new ObjectId(userId) });

    // Respond with success message
    res
      .status(200)
      .json({ success: true, message: "User deleted successfully." });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting user",
      error: error.message,
    });
  }
});

// Heroku Deployment
if (process.env.NODE_ENV === 'production')
{
    // Set static folder
    app.use(express.static('frontend/build'));
    app.get('*', (req, res) =>
    {
        res.sendFile(path.resolve(__dirname, 'frontend', 'build', 'index.html'));
    });
}