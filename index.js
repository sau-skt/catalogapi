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
    SID: { type: String, required: true }
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
            SID
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

        if (categories.length === 0) {
            return res.status(404).send('No categories found for the provided MID and SID');
        }

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

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
