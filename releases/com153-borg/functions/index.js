// COM-153: live-source dependency closure; only these two callables may deploy.
require('dotenv').config();
const admin = require('firebase-admin');
admin.initializeApp();
if (!admin.firestore.FieldValue) {
  admin.firestore.FieldValue = require('firebase-admin/firestore').FieldValue;
}
const { getMaterialLoanPaymentQr, sendMaterialLoanPaymentQrEmail } = require('./src/payment/materialLoanPayment');
exports.getMaterialLoanPaymentQr = getMaterialLoanPaymentQr;
exports.sendMaterialLoanPaymentQrEmail = sendMaterialLoanPaymentQrEmail;
