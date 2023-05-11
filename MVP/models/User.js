const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');

let userSchema = mongoose.Schema({
    username: {
        type: String,
        required: [true, `Username is required`]
    },
    firstName: {
        type: String,
        required: [true, `First name is required`]
    },
    lastName: {
        type: String,
        required: [true, `Last name is required`]
    },
    email: {
        type: String,
        required: [true, `An email is required`]
    },
    password: {
        type: String,
        required: [true, `A password is required`]
    },
    userInventory: [{
        // This object element also contains "_id"
        ownerId: String, // Indicates original owner of item (Established after item is created)
        name: {
            type: String,
            required: [true, `Item name is required`]
        },
        description: String
    }],
    friendsList: [{
        // This object element also contains "_id"
        friendId: String // Friends must have each other's "_id" stored in their friendsList
    }],
    itemRequestList: [{
        // This object element also contains "_id"
        friendId: String, // Friends must have each other's "_id" stored in their itemRequestList
        ownerId: String,
        itemId: String, // Uses the requested item's "_id"
        returnConfirmed: {
            type: Boolean,
            default: false // Must be "true" on both users to trigger query to delete both item request objects
        },
        // returnByDate: {
        //     type: Date, // Submitted by user
        //     required: [true, `A return date is required`]
        // }
    }]
});

userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model('users', userSchema);