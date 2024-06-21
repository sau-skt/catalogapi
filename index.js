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

        if (!categories || categories.length === 0) {
            res.status(200).send(categories);
        } else {
            res.status(200).send(categories);
        }
    } catch (error) {
        res.status(500).send('Error retrieving categories: ' + error.message);
    }
});

// GET route to retrieve categories by MID and SID
app.get('/get-all-category', async (req, res) => {
    const { MID, SID } = req.query;

    if (!MID || !SID) {
        return res.status(400).send('MID and SID are required');
    }

    try {
        const categories = await Category.find({ MID, SID }).select('categoryName status');

        if (!categories || categories.length === 0) {
            res.status(200).send(categories);
        } else {
            res.status(200).send(categories);
        }
    } catch (error) {
        res.status(500).send('Error retrieving categories: ' + error.message);
    }
});

// Define the API endpoint
app.get('/search-category', async (req, res) => {
    const { MID, SID, categoryName } = req.query;

    if (!MID || !SID || !categoryName) {
        return res.status(400).send('MID, SID, and categoryName are required');
    }

    try {
        const regex = new RegExp(categoryName, 'i'); // Create a case-insensitive regex
        const services = await Category.find({
            MID: MID,
            SID: SID,
            categoryName: { $regex: regex },
        }).select('categoryName status');

        res.status(200).json(services);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch categories', error: error.message });
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
    const { categoryId, itemName, itemDescription, itemPrice, MID, SID, status, tag } = req.body;

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
        const items = await Item.find({ MID, SID, categoryId }).select('itemName status itemPrice itemDescription _id');



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

// Endpoint to get the item _id based on SID, MID, categoryId, and itemName
app.get('/get-item-id', async (req, res) => {
    const { SID, MID, categoryId, itemName } = req.query;
  
    if (!SID || !MID || !categoryId || !itemName) {
      return res.status(400).send('Missing required query parameters');
    }
  
    try {
      const item = await Item.findOne({ SID, MID, categoryId, itemName }, '_id');
  
      if (!item) {
        return res.status(404).send('Item not found');
      }
  
      res.status(200).json({ _id: item._id });
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  });

// Define the service schema and model
const serviceSchema = new mongoose.Schema({
    serviceType: { type: String, required: true },
    MID: { type: String, required: true }
});

const Service = mongoose.model('servicetype', serviceSchema);

// POST route to add a new service
app.post('/add-service', async (req, res) => {
    const { serviceType, MID } = req.body;

    // Validate if required fields are provided
    if (!serviceType || !MID) {
        return res.status(400).json({ message: 'serviceType and MID are required fields' });
    }

    try {
        // Create a new service instance
        const newService = new Service({
            serviceType,
            MID
        });

        // Save the new service to the database
        const savedService = await newService.save();

        // Respond with the newly created service
        res.status(201).json(savedService);
    } catch (error) {
        // Handle errors
        res.status(500).json({ message: 'Error creating service', error: error.message });
    }
});

// GET route to retrieve services by MID
app.get('/get-service', async (req, res) => {
    const { MID } = req.query;

    try {
        // Find services by MID
        const services = await Service.find({ MID });

        // Respond with the found services
        res.status(200).json(services);
    } catch (error) {
        // Handle errors
        res.status(500).json({ message: 'Error retrieving services', error: error.message });
    }
});


// Define a schema for the variant
const variantSchema = new mongoose.Schema({
    categoryId: { type: String, required: true },
    itemId: { type: String, required: false },
    variantName: { type: String, required: true },
    MID: { type: String, required: true },
    SID: { type: String, required: true },
    status: { type: String, required: true, enum: ['Active', 'Inactive'] },
  });
  
  // Create a model for the variant
  const Variant = mongoose.model('varianttitle', variantSchema);
  
  // Define the POST endpoint to create a new variant
  app.post('/create-variant-title', async (req, res) => {
    try {
      const { categoryId, itemId, variantName, MID, SID, status } = req.body;
  
      // Validate required fields
      if (!categoryId || !variantName || !MID || !SID || !status) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
  
      // Create a new variant document
      const newVariant = new Variant({
        categoryId,
        itemId,
        variantName,
        MID,
        SID,
        status,
      });
  
      // Save the new variant to the database
      await newVariant.save();
  
      // Send a success response
      res.status(201).json({ message: 'Variant created successfully', variant: newVariant });
    } catch (error) {
      // Handle errors
      res.status(500).json({ error: 'Failed to create variant', details: error.message });
    }
  });

  // Define the GET endpoint to retrieve variants based on SID, MID, and itemId
app.get('/get-variantstitle', async (req, res) => {
    try {
      const { SID, MID, itemId } = req.query;
  
      // Validate required query parameters
      if (!SID || !MID || !itemId) {
        return res.status(400).json({ error: 'Missing required query parameters' });
      }
  
      // Fetch variants from the database based on the query parameters
      const variants = await Variant.find({ SID, MID, itemId });
  
      // Send a success response with the variants
      res.status(200).json(variants);
    } catch (error) {
      // Handle errors
      res.status(500).json({ error: 'Failed to retrieve variants', details: error.message });
    }
  });

  app.get('/get-variantstitle-id', async (req, res) => {
    try {
      const { SID, MID, itemId, categoryId, variantName } = req.query;
  
      // Validate required query parameters
      if (!SID || !MID || !itemId || !categoryId || !variantName) {
        return res.status(400).json({ error: 'Missing required query parameters' });
      }
  
      // Fetch variants from the database based on the query parameters
      const variants = await Variant.findOne({ SID, MID, categoryId, itemId, categoryId, variantName }, '_id');
  
      // Send a success response with the variants
      res.status(200).json(variants);
    } catch (error) {
      // Handle errors
      res.status(500).json({ error: 'Failed to retrieve variants', details: error.message });
    }
  });
  

  // PUT route to update item status
app.put('/update-variant-title-status', async (req, res) => {
    const { variantTitleId } = req.body;

    if (!variantTitleId) {
        return res.status(400).send('Variant Title ID is required');
    }

    try {
        const variant = await Variant.findById(variantTitleId);
        if (!variant) {
            return res.status(404).send('Variant title not found');
        }

        // Toggle status
        variant.status = variant.status === 'Active' ? 'Inactive' : 'Active';
        const updatedVariantTitle = await variant.save();

        res.status(200).send({
            variantName: updatedVariantTitle.variantName,
            status: updatedVariantTitle.status
        });
    } catch (error) {
        res.status(500).send('Error updating status: ' + error.message);
    }
});

app.get('/get-variant-itemid', async (req, res) => {
    const { MID, SID, itemName, categoryId } = req.query;
  
    if (!MID || !SID || !itemName || !categoryId) {
      return res.status(400).json({ error: 'MID, SID, and itemName are required' });
    }
  
    try {
      const item = await Item.findOne({ MID, SID, itemName, categoryId });
  
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }
  
      return res.status(200).json({ _id: item._id });
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

// Define a schema for the variant
const variantItemSchema = new mongoose.Schema({
    categoryId: { type: String, required: true },
    itemId: { type: String, required: false },
    variantTitleId: { type: String, required: false },
    variantItem: { type: String, required: true },
    variantItemPrice: { type: String, required: true },
    MID: { type: String, required: true },
    SID: { type: String, required: true },
    status: { type: String, required: true, enum: ['Active', 'Inactive'] },
  });

  // Create a model for the variant
  const VariantItem = mongoose.model('variantitem', variantItemSchema);


  app.post('/create-variant-item', async (req, res) => {
    const {
      categoryId,
      itemId,
      variantTitleId,
      variantItem,
      variantItemPrice,
      MID,
      SID,
      status
    } = req.body;

    if (!categoryId || !variantItem || !variantItemPrice || !MID || !SID || !status) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    try {
      const newVariantItem = new VariantItem({
        categoryId,
        itemId,
        variantTitleId,
        variantItem,
        variantItemPrice,
        MID,
        SID,
        status
      });

      await newVariantItem.save();
      return res.status(201).json({ message: 'Variant item created successfully', variantItem: newVariantItem });
    } catch (err) {
      console.error('Error creating variant item:', err);  // Log the error details
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
});

app.get('/getvariantitems', async (req, res) => {
    const { MID, SID, variantTitleId } = req.query;

    if (!MID || !SID || !variantTitleId) {
        return res.status(400).json({ error: 'Required query parameters are missing' });
    }

    try {
        const variantItems = await VariantItem.find({ MID, SID, variantTitleId });
        if (!variantItems.length) {
            return res.status(404).json({ message: 'No variant items found' });
        }
        res.status(200).json(variantItems);
    } catch (err) {
        console.error('Error retrieving variant items:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
});

// PUT route to update item status
app.put('/update-variant-item-status', async (req, res) => {
    const { variantItemId } = req.body;

    if (!variantItemId) {
        return res.status(400).send('Variant Title ID is required');
    }

    try {
        const variant = await VariantItem.findById(variantItemId);
        if (!variant) {
            return res.status(404).send('Variant title not found');
        }

        // Toggle status
        variant.status = variant.status === 'Active' ? 'Inactive' : 'Active';
        const updatedVariantTitle = await variant.save();

        res.status(200).send({
            variantName: updatedVariantTitle.variantItem,
            status: updatedVariantTitle.status
        });
    } catch (error) {
        res.status(500).send('Error updating status: ' + error.message);
    }
});

// PUT route to update categoryName and serviceType by categoryId
app.put('/update-variant-item', async (req, res) => {
    const { variantId, variantItem, variantItemPrice } = req.body;

    if (!variantId || !variantItem || !variantItemPrice) {
        return res.status(400).send('Category ID, categoryName, and serviceType are required');
    }

    try {
        const category = await VariantItem.findById(variantId);
        if (!category) {
            return res.status(404).send('Category not found');
        }

        // Update categoryName and serviceType
        category.variantItem = variantItem;
        category.variantItemPrice = variantItemPrice;
        const updatedCategory = await category.save();

        res.status(200).send({
            _id: updatedCategory._id,
            variantItem: updatedCategory.variantItem,
            variantItemPrice: updatedCategory.variantItemPrice,
        });
    } catch (error) {
        res.status(500).send('Error updating category: ' + error.message);
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});