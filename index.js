const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const port = 3001;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json()); // To parse JSON bodies

// MongoDB connection URI
const mongoURI = 'mongodb://127.0.0.1/newToDo';

// Connect to MongoDB
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

// Define the category schema and model
const categorySchema = new mongoose.Schema({
    categoryName: { type: String, required: true },
    status: { type: String, required: true, enum: ['Active', 'Inactive'] },
    serviceType: { type: String, required: true, enum: ['Takeaway', 'Dinein', 'Delivery', 'All'] },
    MID: { type: String, required: true },
    SID: { type: String, required: true },
});

const Category = mongoose.model('Category', categorySchema);

// POST route to create a category
app.post('/category', async (req, res) => {
    const { categoryName, status, serviceType, MID, SID } = req.body;

    if (!categoryName || !status || !serviceType || !MID || !SID) {
        return res.status(400).send('All fields are required');
    }

    try {
        const newCategory = new Category({
            categoryName,
            status,
            serviceType,
            MID,
            SID,
        });

        const savedCategory = await newCategory.save();
        res.status(201).send(savedCategory);
    } catch (error) {
        res.status(500).send('Error saving category: ' + error.message);
    }
});

// GET route to retrieve categories by MID and SID
app.get('/get-category', async (req, res) => {
    const { MID, SID, serviceType } = req.query;

    if (!MID || !SID || !serviceType) {
        return res.status(400).send('MID, SID, and serviceType are required');
    }

    try {
        const categories = await Category.find({ MID, SID, serviceType }).select('categoryName status');


        res.status(200).send(categories);
    } catch (error) {
        res.status(500).send('Error retrieving categories: ' + error.message);
    }
});

// PUT route to update category status
app.put('/update-status', async (req, res) => {
    const { categoryId } = req.body;

    if (!categoryId) {
        return res.status(400).send('Category ID is required');
    }

    try {
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).send('Category not found');
        }

        // Toggle status
        category.status = category.status === 'Active' ? 'Inactive' : 'Active';
        const updatedCategory = await category.save();

        res.status(200).send({
            categoryName: updatedCategory.categoryName,
            status: updatedCategory.status
        });
    } catch (error) {
        res.status(500).send('Error updating status: ' + error.message);
    }
});

// PUT route to update categoryName and serviceType by categoryId
app.put('/update-category', async (req, res) => {
    const { categoryId, categoryName, serviceType } = req.body;

    if (!categoryId || !categoryName || !serviceType) {
        return res.status(400).send('Category ID, categoryName, and serviceType are required');
    }

    try {
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).send('Category not found');
        }

        // Update categoryName and serviceType
        category.categoryName = categoryName;
        category.serviceType = serviceType;
        const updatedCategory = await category.save();

        res.status(200).send({
            _id: updatedCategory._id,
            categoryName: updatedCategory.categoryName,
            serviceType: updatedCategory.serviceType,
            status: updatedCategory.status
        });
    } catch (error) {
        res.status(500).send('Error updating category: ' + error.message);
    }
});

// DELETE route to delete a category by ID
app.delete('/delete-category/:id', async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).send('Category ID is required');
    }

    try {
        const deletedCategory = await Category.findByIdAndDelete(id);
        if (!deletedCategory) {
            return res.status(404).send('Category not found');
        }

        res.status(200).send({ message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).send('Error deleting category: ' + error.message);
    }
});

// GET route to retrieve category ID based on parameters
app.get('/get-item-categoryid', async (req, res) => {
    const { MID, SID, serviceType, categoryName } = req.query;

    if (!MID || !SID || !serviceType || !categoryName) {
        return res.status(400).send('MID, SID, serviceType, and categoryName are required');
    }

    try {
        const category = await Category.findOne({ MID, SID, serviceType, categoryName }).select('_id');

        if (!category) {
            return res.status(404).send('Category not found');
        }

        res.status(200).send(category);
    } catch (error) {
        res.status(500).send('Error retrieving category: ' + error.message);
    }
});

// Define the item schema and model
const itemSchema = new mongoose.Schema({
    categoryId: { type: String, required: true },
    itemName: { type: String, required: true },
    itemDescription: { type: String, required: true },
    itemPrice: { type: String, required: true },
    MID: { type: String, required: true },
    SID: { type: String, required: true },
    status: { type: String, required: true, enum: ['Active', 'Inactive'] },
    tag: { type: String, required: true }
});

const Item = mongoose.model('item', itemSchema);

// POST route to create a new item
app.post('/create-item', async (req, res) => {
    const { categoryId, itemName, itemDescription, itemPrice, MID, SID, status, tag} = req.body;

    if (!categoryId || !itemName || !itemDescription || !itemPrice || !MID || !SID || !status || !tag) {
        return res.status(400).send('All fields are required');
    }

    try {
        const newItem = new Item({
            categoryId,
            itemName,
            itemDescription,
            itemPrice,
            MID,
            SID,
            status,
            tag
        });

        const savedItem = await newItem.save();
        res.status(201).send(savedItem);
    } catch (error) {
        res.status(500).send('Error saving item: ' + error.message);
    }
});

app.get('/get-items', async (req, res) => {
    const { MID, SID, categoryId } = req.query;

    if (!MID || !SID || !categoryId) {
        return res.status(400).send('MID, SID, and categoryId are required');
    }

    try {
        const items = await Item.find({ MID, SID, categoryId }).select('itemName status itemPrice itemDescription');

        

        res.status(200).send(items);
    } catch (error) {
        res.status(500).send('Error retrieving items: ' + error.message);
    }
});

// PUT route to update item status
app.put('/update-item-status', async (req, res) => {
    const { itemId } = req.body;

    if (!itemId) {
        return res.status(400).send('Item ID is required');
    }

    try {
        const item = await Item.findById(itemId);
        if (!item) {
            return res.status(404).send('Item not found');
        }

        // Toggle status
        item.status = item.status === 'Active' ? 'Inactive' : 'Active';
        const updatedItem = await item.save();

        res.status(200).send({
            itemName: updatedItem.itemName,
            status: updatedItem.status
        });
    } catch (error) {
        res.status(500).send('Error updating status: ' + error.message);
    }
});

// PUT route to update an item
app.put('/update-item', async (req, res) => {
    const { _id, itemName, itemDescription, itemPrice, tag } = req.body;

    if (!_id || !itemName || !itemDescription || !itemPrice || !tag) {
        return res.status(400).send('All fields are required');
    }

    try {
        const updatedItem = await Item.findByIdAndUpdate(
            _id,
            {
                itemName,
                itemDescription,
                itemPrice,
                tag
            },
            { new: true, runValidators: true }
        );

        if (!updatedItem) {
            return res.status(404).send('Item not found');
        }

        res.status(200).send(updatedItem);
    } catch (error) {
        res.status(500).send('Error updating item: ' + error.message);
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});