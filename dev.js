function bytesToHex(uint8Array) {
  return Array.from(uint8Array).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const hex = Buffer.from("5C69A0CC5E97CB30A9F30D98E9C9B08919F48E96FD7120A60B4CF15993FF61C4").toString('hex');
console.log(hex)
