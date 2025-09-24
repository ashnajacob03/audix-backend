const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true
	},
	plan: {
		type: String,
		enum: ['monthly', 'yearly'],
		required: true
	},
	amount: {
		type: Number,
		required: true
	},
	currency: {
		type: String,
		default: 'INR'
	},
	periodStart: {
		type: Date,
		default: null
	},
	periodEnd: {
		type: Date,
		default: null
	},
	paymentId: {
		type: String,
		default: null
	},
	status: {
		type: String,
		enum: ['paid', 'refunded', 'void'],
		default: 'paid'
	},
	meta: {
		type: Object,
		default: {}
	}
}, {
	timestamps: true
});

module.exports = mongoose.model('Invoice', invoiceSchema);






