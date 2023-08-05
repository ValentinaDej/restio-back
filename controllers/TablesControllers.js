const { Table, Order } = require('../models');
const asyncErrorHandler = require('../utils/errors/asyncErrorHandler');
const {
  NotFoundError,
  AuthorizationError,
  BadRequestError,
} = require('../utils/errors/CustomErrors');
const { StatusCodes } = require('http-status-codes');
const { OK } = StatusCodes;

const tableController = {
  getTable: asyncErrorHandler(async (req, res, next) => {
    const { id } = req.params;
    const table = await Table.findById(id);

    if (!table) {
      const err = new NotFoundError('Table not found for the given table ID!');
      return next(err);
    }

    res.status(OK).json(table);
  }),

  getTablesByRestaurantId: asyncErrorHandler(async (req, res, next) => {
    const { id } = req.params;
    const tables = await Table.find({ restaurant_id: id });

    if (!tables) {
      const err = new BadRequestError();
      return next(err);
    }

    res.status(OK).json(tables);
  }),

  updateTable: asyncErrorHandler(async (req, res, next) => {
    const { id } = req.params;
    const { status, restaurant_id } = req.body;
    let updatedTable;
    const table = await Table.findById(id);

    if (!table) {
      const err = new NotFoundError('Table not found for the given table ID!');
      return next(err);
    }

    if (table.restaurant_id.toString() !== restaurant_id) {
      const err = new AuthorizationError();
      return next(err);
    }

    table.status = status;

    if (status !== 'Free') {
      updatedTable = await table.save();
      return;
    }

    if (status === 'Free') {
      const orders = await Order.find({
        table_id: id,
        rest_id: restaurant_id,
        status: { $ne: 'Closed' },
      });

      const allOrdersCanBeClosed = orders.every((order) => {
        return orderCanBeClosed(order);
      });

      if (!allOrdersCanBeClosed) {
        const err = new NotFoundError('Not all orders are paid for this table ID!');
        return next(err);
      }

      if (allOrdersCanBeClosed) {
        await Promise.all(orders.map((order) => closeOrder(order)));
        updatedTable = await table.save();
      }

      const response = {
        updatedTable: updatedTable,
        updatedOrders: orders,
      };

      res.status(OK).json(response);
    }
  }),
};

module.exports = tableController;

async function closeOrder(order) {
  order.status = 'Closed';
  await order.save();
}

// Helper function to check if an order can be closed
function orderCanBeClosed(order) {
  return order.status === 'Paid';
}

//set orders statuses to closed after table is free
const changeAllOrdersToClosed = asyncErrorHandler(async (req, res, next) => {
  const { restId, tableId } = req.params;

  const table = await Table.exists({
    restaurant_id: restId,
    _id: tableId,
  });
  if (!table) {
    return next(new NotFoundError('No table with this id was found in this restaurant'));
  }

  const orders = await Order.updateMany(
    {
      rest_id: restId,
      table_id: tableId,
      status: { $ne: 'Closed' },
    },
    { $set: { status: 'Closed' } }
  );

  if (orders.modifiedCount === 0) {
    return next(new NotFoundError('No orders found to update'));
  }
  res.json({
    status: 'success',
    code: 200,
    message: `Updated ${orders.modifiedCount} orders to "Closed"`,
  });
});
