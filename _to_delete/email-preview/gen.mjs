import { _renderEmail, _customerCopy, _storeCopy } from '../../Backend/services/orderNotifications.js';
import fs from 'fs';
const out = new URL('.', import.meta.url).pathname;
const base={id:7,orderNumber:'MB2026000004',paymentMethod:'cod',paymentStatus:'pending',totalAmount:82099,subtotal:82099,productDiscount:12000,couponDiscount:500,platformDiscount:0,deliveryCharge:0,codFee:0,taxAmount:12447,shipName:'Payal Priya',shipLine1:'Room 601, Hariom Elegance, Rajvee Tower',shipCity:'Vadodara',shipState:'Gujarat',shipPinCode:'390015',shipPhone:'8360609878',customerFirstName:'Payal',placedAt:'2026-09-25T06:27:00Z',courierName:'Delhivery',trackingNumber:'72647246764',trackingUrl:'https://www.delhivery.com/track/package/72647246764',couponCode:'WELCOME500',invoiceNumber:'WEB/0001/26-27'};
const items=[{itemName:'Apple iPhone 16',brandName:'Apple',variant:'128 GB',colorName:'Black',qty:1,unitPrice:82599,originalPrice:94400,lineTotal:82599,image:'https://shop.applenext.in/backend-api/uploads/items/x.jpg'}];
const store={tradeName:'AppleNext',legalName:'AppleNext Electronics Pvt Ltd',phone:'+91 98765 43210',email:'support@applenext.in',website:'https://shop.applenext.in',addressLine1:'Alkapuri',city:'Vadodara',state:'Gujarat',pinCode:'390007',gstin:'24ABCDE1234F1Z5'};
const times={confirmedAt:'2026-09-25T07:00:00Z',packedAt:'2026-09-25T09:10:00Z',shippedAt:'2026-09-25T12:00:00Z',deliveredAt:'2026-09-26T08:00:00Z'};
const order_={processing:[],confirmed:['confirmedAt'],packed:['confirmedAt','packedAt'],shipped:['confirmedAt','packedAt','shippedAt'],out_for_delivery:['confirmedAt','packedAt','shippedAt'],delivered:['confirmedAt','packedAt','shippedAt','deliveredAt'],cancelled:[]};
const ev={placed:'processing',confirmed:'confirmed',packed:'packed',shipped:'shipped',out_for_delivery:'out_for_delivery',delivered:'delivered',cancelled:'cancelled'};
for (const [e,status] of Object.entries(ev)) {
  const order={...base,status,paymentStatus: e==='delivered'?'paid':'pending'};
  for (const k of order_[status]) order[k]=times[k];
  const r=_renderEmail({copy:_customerCopy(e,order,{invoiceAttached:true}),order,items,store,audience:'customer'});
  fs.writeFileSync(out+e+'.html', r.html); if(e==='placed') fs.writeFileSync(out+'placed.txt', r.text);
}
const o={...base,status:'processing'};
fs.writeFileSync(out+'store_placed.html', _renderEmail({copy:_storeCopy('placed',o,{}),order:o,items,store,audience:'store'}).html);
console.log('generated');
process.exit(0);
