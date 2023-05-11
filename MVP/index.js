const express = require('express');
const app = express();
app.use(express.static(`public`)); // Access the static ("public") folder
const passport = require('passport');
const LocalStrategy = require('passport-local');

const mongoose = require('mongoose');
const keys = require('./config/keys');

mongoose.connect(keys.mongoURI)
    .then(() => console.log(`Connected to ${keys.db} database.`))
    .catch((err) => console.error(`Error connecting to ${keys.db} database: ${err}`))

const User = require('./models/User');
const { findById, findOneAndUpdate, updateOne } = require('./models/User');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(require('express-session')({
    secret: "Blah, blah, blah", // Used to encrypt the user info before saving to DB
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize())
app.use(passport.session())
passport.use(new LocalStrategy(User.authenticate()))
passport.serializeUser(User.serializeUser())
passport.deserializeUser(User.deserializeUser())

app.get('/', (req, res) => {
    res.redirect('/landing_page')
});

app.get('/landing_page', (req, res) => {
    res.render('landing_page.ejs')
});

app.get('/about', (req, res) => {
    res.render('about.ejs')
});

app.get('/faq', (req, res) => {
    res.render('faq.ejs')
});

app.get('/private_policy', (req, res) => {
    res.render('private_policy.ejs')
});

app.get('/contact_us', (req, res) => {
    res.render('contact_us.ejs')
});

const isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) { return next() }
    res.redirect('/login')
}

/* Profile page is the home page */
app.get('/profile', isLoggedIn, async (req, res) => {

    const convertObjectsInArr = async (arr, list) => {
        // Extracts specified key's value from object elements in the array 
        // Resulting array contains no duplicate elements
        let tempSet = new Set() // Temp collection that only stores unique values
        let updatedArr = [] // Used for updating database data with filtered array

        let newArr = await arr
            .filter(obj => {
                if (tempSet.has(obj.friendId)) { return false }; // Check if value hasn't already been added to new array
                updatedArr.push(obj)
                tempSet.add(obj.friendId) // Add to Set for future checks
                return true;
            })
            .map(obj => { return obj.friendId }) // Now extract the value from the specified key as an element into a new array

        // Removes duplicate requests
        if (list === `friendsList`) {
            try {
                // Update user's friendsList with a filtered array to remove duplicate requests
                await User.updateOne(
                    { _id: req.user._id },
                    { $set: { friendsList: updatedArr } })
            } catch (err) { console.log(err) }
        }

        return newArr;
    }

    try {
        const sessionUserDoc = await User.findById({ _id: req.user._id })

        if (sessionUserDoc.friendsList.length > 0) {
            // Query for all friend user documents
            const usersFriendsObjArr = await User.find({ _id: { $in: await convertObjectsInArr(sessionUserDoc.friendsList, `friendsList`) } })
            let friendRequestObjArr = [] // Pending friend requests
            let friendUserObjArr = [] // Confirmed friends
            let itemRequestObjArr = [] // Pending item requests
            let itemBorrowObjArr = [] // Currently borrowed items

            // Sort user objects into separate arrays, one for friends, the other for friend requests
            await usersFriendsObjArr.map((userObj) => {
                const { friendsList } = userObj

                if (friendsList.length > 0) {
                    for (let i = 0; i < friendsList.length; i++) {
                        if (friendsList[i].friendId == req.user._id) {
                            friendUserObjArr.push(userObj) // Confirmed friend
                        } else if (i === friendsList.length - 1) {
                            friendRequestObjArr.push(userObj)
                        }
                    }
                }
                else { friendRequestObjArr.push(userObj) } // Friend request
            })

            // Sort user objects into separate arrays, one for borrowed items, the other for item requests
            const createSuperObj = (sessionItemReqObj, friendItemReqObj, sessionUserObj, friendObj) => {
                if (friendItemReqObj) {
                    let itemOwner = {}
                    let ownerItemReqObj = {}

                    let itemBorrower = {}
                    let borrowerItemReqObj = {}

                    let sessionUserIsOwner = false

                    // Insert appropriate item info depending on the current session user viewing the page
                    if (sessionItemReqObj.ownerId == sessionItemReqObj.friendId) {
                        // Session user is the item borrower
                        sessionUserIsOwner = false
                        itemOwner = friendObj
                        ownerItemReqObj = friendItemReqObj
                        itemBorrower = sessionUserObj
                        borrowerItemReqObj = sessionItemReqObj
                    } else {
                        // Session user is the item owner
                        sessionUserIsOwner = true
                        itemOwner = sessionUserObj
                        ownerItemReqObj = sessionItemReqObj
                        itemBorrower = friendObj
                        borrowerItemReqObj = friendItemReqObj
                    }

                    let itemObj = (() => {
                        for (let i = 0; i < itemOwner.userInventory.length; i++) {
                            if (itemOwner.userInventory[i]._id == sessionItemReqObj.itemId) {
                                return {
                                    ownerUsername: itemOwner.username, // Depending on who's logged in, display the appropriate owner of the item
                                    ownerId: String(itemOwner._id),
                                    itemName: itemOwner.userInventory[i].name,
                                    description: itemOwner.userInventory[i].description,
                                    sessionUserIsOwner: sessionUserIsOwner,
                                    ownerReturnConfirmed: ownerItemReqObj.returnConfirmed, // true/false
                                    borrowerReturnConfirmed: borrowerItemReqObj.returnConfirmed, // true/false
                                }
                            }
                        }
                    })() // IIFE

                    return {
                        ...itemObj,
                        itemId: sessionItemReqObj.itemId,
                        borrowerId: itemBorrower._id,
                        borrowerUsername: itemBorrower.username,
                    }
                } else {
                    // In the case owner has been sent an item request object, 
                    // but other user has 0 item request objects in their itemRequestList
                    let itemOwner = {}
                    let ownerItemReqObj = {}

                    let itemBorrower = {}

                    let sessionUserIsOwner = false

                    // Insert appropriate item info depending on the current session user viewing the page
                    if (sessionItemReqObj.ownerId == sessionItemReqObj.friendId) {
                        // Session user is the item borrower
                        sessionUserIsOwner = false
                        itemOwner = friendObj
                        itemBorrower = sessionUserObj
                    } else {
                        // Session user is the item owner
                        sessionUserIsOwner = true
                        itemOwner = sessionUserObj
                        ownerItemReqObj = sessionItemReqObj
                        itemBorrower = friendObj
                    }

                    let itemObj = (() => {
                        for (let i = 0; i < itemOwner.userInventory.length; i++) {
                            if (itemOwner.userInventory[i]._id == sessionItemReqObj.itemId) {
                                return {
                                    ownerUsername: itemOwner.username, // Depending on who's logged in, display the appropriate owner of the item
                                    ownerId: String(itemOwner._id),
                                    itemName: itemOwner.userInventory[i].name,
                                    description: itemOwner.userInventory[i].description,
                                    sessionUserIsOwner: sessionUserIsOwner,
                                    ownerReturnConfirmed: ownerItemReqObj.returnConfirmed, // true/false
                                }
                            }
                        }
                    })() // IIFE

                    return {
                        ...itemObj,
                        itemId: sessionItemReqObj.itemId,
                        borrowerId: itemBorrower._id,
                        borrowerUsername: itemBorrower.username,
                    }
                }
            }

            const endResCycle = () => {
                setTimeout(() => {
                    res.render('profile.ejs', {
                        sessionUser: sessionUserDoc, // Session user

                        friendRequestObjArr, // Pending friend requests
                        friendUserObjArr, // Confirmed friends

                        itemRequestObjArr, // Pending item requests
                        itemBorrowObjArr // Currently borrowed items
                    })
                }, 0000);
            }

            const itemRequestListSession = sessionUserDoc.itemRequestList

            // If session user has any item request objects
            if (itemRequestListSession.length > 0) {
                // Loop through friend users and check their itemRequestList
                for (let i = 0; i < itemRequestListSession.length; i++) {
                    // Query for the friend user who sent the item request
                    const friendDoc = await User.findById({ _id: itemRequestListSession[i].friendId })
                    const itemRequestListFriend = friendDoc.itemRequestList

                    // Loop through friend user's itemRequestList array to find a related item request object 
                    // If the friend user doesn't have any item request objects move on to next user
                    if (itemRequestListFriend.length > 0) {
                        for (let j = 0; j < itemRequestListFriend.length; j++) {
                            // Check all item request objects on both users' ends to find matching "itemId" value
                            if (itemRequestListFriend[j].itemId == itemRequestListSession[i].itemId) {
                                await itemBorrowObjArr.push(createSuperObj(itemRequestListSession[i], itemRequestListFriend[j], sessionUserDoc, friendDoc))

                                // If this is the last friend user, render page
                                if (i === itemRequestListSession.length - 1) {
                                    endResCycle()
                                    break
                                } else { break } // Else, end comparison search for current item request object, move on to next item request object
                            } else {
                                // If no match by the end of the loop, add object to notifications array

                                // If this is not the last item req obj to be checked, continue search
                                if (j !== itemRequestListFriend.length - 1) {
                                    continue // Continue comparison search on the next item request object
                                }
                                // Else if this is the last item req obj to be checked, stop search and push obj to notifications
                                else if (j === itemRequestListFriend.length - 1) {
                                    await itemRequestObjArr.push(createSuperObj(itemRequestListSession[i], itemRequestListFriend[j], sessionUserDoc, friendDoc))
                                    // If this is the last friend user, render page
                                    if (i === itemRequestListSession.length - 1) {
                                        endResCycle()
                                        break
                                    } else { break } // Else, end comparison search for current item request object, move on to next item request object
                                }
                            }
                        }
                    } else {
                        console.log(`This friend user has no item request objects`)
                        await itemRequestObjArr.push(createSuperObj(itemRequestListSession[i], null, sessionUserDoc, friendDoc))

                        // If this is the last friend user, render page
                        if (i === itemRequestListSession.length - 1) { endResCycle() }
                    }

                }
            } else { endResCycle() }

        } else {
            console.log(`Session user has no friend users`)

            res.render('profile.ejs', {
                sessionUser: sessionUserDoc, // Session user
                friendRequestObjArr: [], // Pending friend requests
                friendUserObjArr: [], // Confirmed friends
                itemRequestObjArr: [], // Pending item requests
                itemBorrowObjArr: [], // Currently borrowed items
            })
        }
    } catch (err) { console.log(`ErRoR: ${err}`) }
});


app.post('/profile/:action/:userId', isLoggedIn, async (req, res) => {
    if (req.params.action === `friend-accept`) {
        try {
            // Update database by creating object containing session user's id
            // then insert the object into the other user's friendsList array
            let friendReqObj = { friendId: req.user._id } // Session user "_id"

            // Query to send a friend request object back to other user to confirm friend status
            await User.updateOne(
                { _id: req.params.userId },
                { $push: { friendsList: friendReqObj } }
            )

            res.redirect('/profile');
        } catch (err) { console.log(err) }
    } else if (req.params.action === `friend-decline`) {
        try {
            // Get copy of user's friendList array, remove friend request object, return resulting array
            const userDoc = await User.findById({ _id: req.user._id })

            let newArr = await (userDoc.friendsList).filter((friendReqObj) => {
                return (friendReqObj.friendId == req.params.userId) ? false : true
            })

            await User.updateOne(
                { _id: req.user._id },
                { $set: { friendsList: newArr } }
            )

            res.redirect('/profile')
        } catch (err) { console.log(err) }
    } else if (req.params.action === `friend-remove`) {
        try {
            // When pressing remove button on a friend user box, make multiple queries to update both users' friendsList

            // Updates user's friendsList
            const userDoc = await User.findById({ _id: req.user._id })

            let newArrUser = await (userDoc.friendsList).filter((friendReqObj) => {
                return (friendReqObj.friendId == req.params.userId) ? false : true
            })

            await User.updateOne(
                { _id: req.user._id },
                { $set: { friendsList: newArrUser } }
            )

            //-------------------------------------------------
            // Updates other user's friendsList
            const otherUserDoc = await User.findById({ _id: req.params.userId })

            let newArrOtherUser = await (otherUserDoc.friendsList).filter((friendReqObj) => {
                return (friendReqObj.friendId == req.user._id) ? false : true
            })

            // Make another query to update user's friendsList with new array
            await User.updateOne(
                { _id: req.params.userId },
                { $set: { friendsList: newArrOtherUser } }
            )

            res.redirect('/profile');
        } catch (err) { console.log(err) }
    }
});

app.post('/profile/:action/:userId/:itemId', isLoggedIn, async (req, res) => {
    if (req.params.action === `item-accept`) {
        try {
            // User receiving the item request is sending an item request object back to confirm the item is now being lent to the other user
            let itemRequestObj = {
                friendId: req.user._id, // Session user _id
                ownerId: req.user._id, // The session user accepting the request is the item owner
                itemId: req.params.itemId // Requested item _id
            }

            await User.updateOne(
                { _id: req.params.userId },
                { $push: { itemRequestList: itemRequestObj } }
            )

            res.redirect('/profile')
        } catch (err) { console.log(err) }
    } else if (req.params.action === `item-decline`) {
        try {
            // Get copy of user's itemRequestList array, remove item request object, return resulting array
            const userDoc = await User.findById({ _id: req.user._id })

            let newArr = await (userDoc.itemRequestList).filter((itemReqObj) => {
                return (itemReqObj.friendId == req.params.userId) ? false : true // Exclude the selected item request object from the new array
            })

            await User.updateOne(
                { _id: req.user._id },
                { $set: { itemRequestList: newArr } }
            )

            res.redirect('/profile')
        } catch (err) { console.log(err) }
    } else if (req.params.action === `item-remove`) {
        try {
            // Removes both respective item request objects from both users
            // Use the :itemId to find the item request object with the matching itemId, and remove it from both users' itemRequestList

            // Updates session user's itemRequestList
            const userDoc = await User.findById({ _id: req.user._id })

            let newArrUser = await (userDoc.itemRequestList).filter((itemReqObj) => {
                return (itemReqObj.itemId == req.params.itemId) ? false : true // If item request object contains matching itemId, exclude it from the resulting array
            })

            // Make another query to update user's itemRequestList with new array
            await User.updateOne(
                { _id: req.user._id },
                { $set: { itemRequestList: newArrUser } }
            )

            //-------------------------------------------
            // Updates other user's itemRequestList
            const otherUserDoc = await User.findById({ _id: req.params.userId })

            let newArrOtherUser = await (otherUserDoc.itemRequestList).filter((itemReqObj) => {
                return (itemReqObj.itemId == req.params.itemId) ? false : true
            })

            await User.updateOne(
                { _id: req.params.userId },
                { $set: { itemRequestList: newArrOtherUser } }
            )

            res.redirect('/profile')
        } catch (err) { console.log(err) }
    }
    else if (req.params.action === `item-borrower-initiate-return`) {
        try {
            // Borrower sets their item request object's returnConfirmed as true

            // Updates session user's itemRequestList
            const userDoc = await User.findById({ _id: req.user._id })

            // Replace item request object in list with an updated one
            let newArr = await (userDoc.itemRequestList).map(itemReqObj => {
                if (itemReqObj.itemId == req.params.itemId) {
                    // Create new object with "returnConfirmed" marked as true
                    return {
                        friendId: itemReqObj.friendId,
                        ownerId: itemReqObj.ownerId,
                        itemId: itemReqObj.itemId,
                        returnConfirmed: true,
                        returnByDate: itemReqObj.returnByDate
                    }
                } else { return itemReqObj }
            })

            // Make another query to update user's itemRequestList with new array
            await User.updateOne(
                { _id: req.user._id },
                { $set: { itemRequestList: newArr } }
            )

            res.redirect('/profile')
        } catch (err) { console.log(err) }
    } else if (req.params.action === `item-owner-decline-return`) {
        try {
            // Owner resets the borrower's item request object's returnConfirmed back to false

            // Updates other user's itemRequestList
            const otherUserDoc = await User.findById({ _id: req.params.userId })

            // Replace item request object in list with an updated one
            let newArr = await (otherUserDoc.itemRequestList).map((itemReqObj) => {
                if (itemReqObj.itemId == req.params.itemId) {
                    // Create new object with "returnConfirmed" marked as true
                    return {
                        friendId: itemReqObj.friendId,
                        ownerId: itemReqObj.ownerId,
                        itemId: itemReqObj.itemId,
                        returnConfirmed: false,
                        returnByDate: itemReqObj.returnByDate
                    }
                } else { return itemReqObj }
            })

            // Make another query to update user's itemRequestList with new array
            await User.updateOne(
                { _id: req.params.userId },
                { $set: { itemRequestList: newArr } }
            )

            res.redirect('/profile')
        } catch (err) { console.log(err) }
    }
});

/* Page displays another user's inventory */
app.get('/items-other-user/:selectedUserId', isLoggedIn, async (req, res) => {
    try {
        const doc_SessionUser = await User.findById({ _id: req.user._id }) // Query for session user
        const doc_SelectedUser = await User.findById({ _id: req.params.selectedUserId }) // Query for selected user

        // Display selected user's inventory
        res.render('itemsOtherUser.ejs', {
            selectedUser: doc_SelectedUser
        })
    } catch (err) { console.log(err) }
});

app.post('/items-other-user/:action/:selectedUserId/:itemId', isLoggedIn, async (req, res) => {
    if (req.params.action === `item-request`) {
        try {
            // Create item request object to send
            let itemRequestObj = {
                friendId: req.user._id, // Session user "_id" (requester)
                ownerId: req.params.selectedUserId, // Owner of the item 
                itemId: req.params.itemId // Requested item's "_id"
            }

            // Query to send item request
            await User.updateOne(
                { _id: req.params.selectedUserId },
                { $push: { itemRequestList: itemRequestObj } }
            )

            res.redirect(`/items-other-user/${req.params.selectedUserId}`)
        } catch (err) { console.log(err) }
    }
});

/* Read All Items */
app.get('/items', isLoggedIn, async (req, res) => {
    // Query for database data, then render page
    try {
        const doc = await User.findById({ _id: req.user._id })

        res.render('items.ejs', {
            user: doc, // Session user object
            userInventory: doc.userInventory
        })
    } catch (err) { console.log(`error: ${err}`) }

    // User.findById({ _id: req.user._id },
    //     (err, doc) => {
    //         if (err) { console.log(`error: ${err}`) }
    //         else {
    //             // console.log(doc);
    //             res.render('items.ejs', {
    //                 user: doc, // Session user object
    //                 userInventory: doc.userInventory
    //             })
    //         }
    //     })
});

app.post('/items/:action/', isLoggedIn, async (req, res) => {
    if (req.params.action === `item-create`) {
        try {
            const itemObj = {
                ownerId: req.user._id, // Set who owns item
                name: req.body.name, // Item name
                description: req.body.description
            }

            const doc = await User.updateOne(
                { _id: req.user._id },
                { $push: { userInventory: itemObj } }
            )

            res.redirect('/items');
        } catch (err) { console.log(err) }
    }
});

/* Delete an item */
app.post('/items/:action/:id', isLoggedIn, async (req, res) => {
    if (req.params.action === `item-delete`) {
        // "Delete" item by creating new array without the item, then use it to replace DB's array
        try {
            const doc = await User.findById({ _id: req.user._id })
            const { userInventory } = doc

            const updatedArr = await (() => {
                let resultArr = []

                for (let i = 0; i < userInventory.length; i++) {
                    // Use "==" to coerce both id values into strings for comparison
                    if (userInventory[i]._id == req.params.id) { continue } // Skip unwanted item
                    else { resultArr.push(userInventory[i]) }
                }

                return resultArr
            })() // IIFE

            // Query to replace userInventory array
            const doc2 = await User.updateOne(
                { _id: req.user._id },
                { $set: { userInventory: updatedArr } }
            )

            res.redirect(`/items`) // Refresh page
        } catch (err) { console.log(err) }
    }
});


app.get('/itemEdit/:id', isLoggedIn, async (req, res) => {
    // Query for session user object
    try {
        const doc = await User.findById({ _id: req.user._id })
        const { userInventory } = doc

        for (let i = 0; i < userInventory.length; i++) {
            if (userInventory[i]._id == req.params.id) {
                res.render('itemEdit.ejs', {
                    item: userInventory[i], // Item object
                    user: doc // Session user object
                })
            }
        }
    } catch (err) { console.log(err); }
})

app.post('/itemEdit/:action/:id', isLoggedIn, async (req, res) => {
    // Transfer the selected item's information to the next page (data from /items, to /itemEdit page)
    if (req.params.action === 'item-edit') {
        // Create a new array with updated contents, then replace existing array in DB with new one
        try {
            const doc = await User.findById({ _id: req.user._id })

            const { userInventory } = doc
            let updatedArr = await (() => {
                let resultArr = []

                for (let i = 0; i < userInventory.length; i++) {
                    // Use "==" to coerce both id values into strings for comparison
                    if (userInventory[i]._id == req.params.id) {
                        // Create new item object, then push it to array
                        let newItem = {
                            _id: userInventory[i]._id,
                            ownerId: userInventory[i].ownerId,
                            name: req.body.name ? req.body.name : userInventory[i].name, // Ensure empty input fields don't overwrite values
                            description: req.body.description ? req.body.description : userInventory[i].description // Ensure empty input fields don't overwrite values
                        }
                        resultArr.push(newItem)
                    } else { resultArr.push(userInventory[i]) }
                }

                return resultArr
            })() // IIFE

            // Query to replace userInventory array
            await User.updateOne({ _id: req.user._id }, { $set: { userInventory: updatedArr } })

            res.redirect(`/itemEdit/${req.params.id}`) // Refresh page
        } catch (err) { console.log(err) }
    }
})


app.get('/users', isLoggedIn, async (req, res) => {
    // Query all users from the database to display on page
    try {
        const docs = await User.find({})

        res.render('users.ejs', { users: docs })
    } catch (err) { console.log(`error: ${err}`) }
});

app.post('/users/:action/:userId', isLoggedIn, async (req, res) => {
    if (req.params.action === `friend-request`) {
        try {
            // Create friend request object to be sent to a user's friendsList
            let friendReqObj = { friendId: req.user._id }

            const doc = await User.updateOne(
                { _id: req.params.userId },
                { $push: { friendsList: friendReqObj } }
            )

            res.redirect('/users')
        } catch (err) { console.log(err) }
    }
});

/* Registration Routes */
app.get('/signup', (req, res) => {
    res.render('signup.ejs')
});

app.post("/signup", function (req, res) {
    let newUser = new User({ username: req.body.username, firstName: req.body.firstName, lastName: req.body.lastName, email: req.body.email, password: req.body.password });

    User.register(newUser, req.body.password, function (err, user) {
        if (err) {
            console.log(err);
            return res.render("signup.ejs")
        } else {
            passport.authenticate("local")(req, res, function () {
                res.redirect("/profile");
            });
        }
    })
});

/* Login Routes */
app.get('/login', (req, res) => {
    res.render('login.ejs')
})

app.post('/login', passport.authenticate('local',
    {
        successRedirect: '/profile',
        failureRedirect: '/login'
    }), (req, res) => {
        // We dont need anything in our callback function 
    });

app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/login');
});

/* Temporary developer page for making easy queries */
app.get('/devtools', isLoggedIn, async (req, res) => {
    // Queries for user data:
    try {
        const sessionUser = await User.findById({ _id: req.user._id })
        const users = await User.find({})

        res.render('devtools.ejs', {
            sessionUser: sessionUser,
            users: users,
        })

    } catch (err) { console.log(`error: ${err}`) }
})

app.post('/devtools/:action/:userId', isLoggedIn, async (req, res) => {
    if (req.params.action === `clear-inventory`) {

    } else if (req.params.action === `clear-friendsList`) {
        // Clear friends
        try {
            const doc = await User.updateOne(
                { _id: req.params.userId },
                { $set: { friendslist: [] } }
            )

            res.redirect(`/devtools`);
        } catch (err) { console.log(err) }
    } else if (req.params.action === `find-user-session` && req.params.userId === req.user._id) {
        // Query for session user info

    } else if (req.params.action === `find-user-other` && req.params.userId !== req.user._id) {
        // Query for user info that isn't the session user

    } else if (req.params.action === `delete-user` && req.params.userId !== req.user._id) {
        try {
            const deletedDoc = await User.deleteOne({ _id: req.params.userId })

            res.redirect(`/devtools`)
        } catch (error) { console.log(err) }
    } else if (req.params.action === `clear-itemRequestList`) {
        try {
            // Clear items
            const doc = await User.updateOne(
                { _id: req.params.userId },
                { $set: { itemRequestList: [] } }
            )

            res.redirect(`/devtools`);
        } catch (err) { console.log(err) }
    }

    // Ability to update fields from database (username, firstname, password...)
});

app.get('*', (req, res) => {
    res.send('Wrong page, hermano!')
});


const port = process.env.PORT || 3000
app.listen(port, () => console.log(`App is running on port ${port}`));