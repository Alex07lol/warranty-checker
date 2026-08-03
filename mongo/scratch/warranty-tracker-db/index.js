// Central export – import any model from a single location
// e.g.  const { User, Product } = require('./models');

module.exports = {
  User: require("./models/User"),
  Product: require("./models/Product"),
  Document: require("./models/Document"),
  ServiceHistory: require("./models/ServiceHistory"),
  Notification: require("./models/Notification"),
};
