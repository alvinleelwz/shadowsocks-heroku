// Generated by CoffeeScript 1.10.0
(function() {
  var EVP_BytesToKey, Encryptor, bytes_to_key_results, cachedTables, create_rc4_md5_cipher, crypto, getTable, int32Max, merge_sort, method_supported, substitute;

  crypto = require("crypto");

  merge_sort = require("./merge_sort").merge_sort;

  int32Max = Math.pow(2, 32);

  cachedTables = {};

  getTable = function(key) {
    var ah, al, decrypt_table, hash, i, md5sum, result, table;
    if (cachedTables[key]) {
      return cachedTables[key];
    }
    console.log("calculating ciphers");
    table = new Array(256);
    decrypt_table = new Array(256);
    md5sum = crypto.createHash("md5");
    md5sum.update(key);
    hash = Buffer.from(md5sum.digest(), "binary");
    al = hash.readUInt32LE(0);
    ah = hash.readUInt32LE(4);
    i = 0;
    while (i < 256) {
      table[i] = i;
      i++;
    }
    i = 1;
    while (i < 1024) {
      table = merge_sort(table, function(x, y) {
        return ((ah % (x + i)) * int32Max + al) % (x + i) - ((ah % (y + i)) * int32Max + al) % (y + i);
      });
      i++;
    }
    i = 0;
    while (i < 256) {
      decrypt_table[table[i]] = i;
      ++i;
    }
    result = [table, decrypt_table];
    cachedTables[key] = result;
    return result;
  };

  substitute = function(table, buf) {
    var i;
    i = 0;
    while (i < buf.length) {
      buf[i] = table[buf[i]];
      i++;
    }
    return buf;
  };

  bytes_to_key_results = {};

  EVP_BytesToKey = function(password, key_len, iv_len) {
    var count, d, data, i, iv, key, m, md5, ms;
    if (bytes_to_key_results[password + ":" + key_len + ":" + iv_len]) {
      return bytes_to_key_results[password + ":" + key_len + ":" + iv_len];
    }
    m = [];
    i = 0;
    count = 0;
    while (count < key_len + iv_len) {
      md5 = crypto.createHash('md5');
      data = password;
      if (i > 0) {
        data = Buffer.concat([m[i - 1], password]);
      }
      md5.update(data);
      d = md5.digest();
      m.push(d);
      count += d.length;
      i += 1;
    }
    ms = Buffer.concat(m);
    key = ms.slice(0, key_len);
    iv = ms.slice(key_len, key_len + iv_len);
    bytes_to_key_results[password] = [key, iv];
    return [key, iv];
  };

  method_supported = {
    'aes-128-cfb': [16, 16],
    'aes-192-cfb': [24, 16],
    'aes-256-cfb': [32, 16],
    'bf-cfb': [16, 8],
    'camellia-128-cfb': [16, 16],
    'camellia-192-cfb': [24, 16],
    'camellia-256-cfb': [32, 16],
    'cast5-cfb': [16, 8],
    'des-cfb': [8, 8],
    'idea-cfb': [16, 8],
    'rc2-cfb': [16, 8],
    'rc4': [16, 0],
    'rc4-md5': [16, 16],
    'seed-cfb': [16, 16]
  };

  create_rc4_md5_cipher = function(key, iv, op) {
    var md5, rc4_key;
    md5 = crypto.createHash('md5');
    md5.update(key);
    md5.update(iv);
    rc4_key = md5.digest();
    if (op === 1) {
      return crypto.createCipheriv('rc4', rc4_key, '');
    } else {
      return crypto.createDecipheriv('rc4', rc4_key, '');
    }
  };

  Encryptor = (function() {
    function Encryptor(key1, method1) {
      var ref;
      this.key = key1;
      this.method = method1;
      this.iv_sent = false;
      if (this.method === 'table') {
        this.method = null;
      }
      if (this.method != null) {
        this.cipher = this.get_cipher(this.key, this.method, 1, crypto.randomBytes(32));
      } else {
        ref = getTable(this.key), this.encryptTable = ref[0], this.decryptTable = ref[1];
      }
    }

    Encryptor.prototype.get_cipher_len = function(method) {
      var m;
      method = method.toLowerCase();
      m = method_supported[method];
      return m;
    };

    Encryptor.prototype.get_cipher = function(password, method, op, iv) {
      var iv_, key, m, ref;
      method = method.toLowerCase();
      password = Buffer.from(password, 'binary');
      m = this.get_cipher_len(method);
      if (m != null) {
        ref = EVP_BytesToKey(password, m[0], m[1]), key = ref[0], iv_ = ref[1];
        if (iv == null) {
          iv = iv_;
        }
        if (op === 1) {
          this.cipher_iv = iv.slice(0, m[1]);
        }
        iv = iv.slice(0, m[1]);
        if (method === 'rc4-md5') {
          return create_rc4_md5_cipher(key, iv, op);
        } else {
          if (op === 1) {
            return crypto.createCipheriv(method, key, iv);
          } else {
            return crypto.createDecipheriv(method, key, iv);
          }
        }
      }
    };

    Encryptor.prototype.encrypt = function(buf) {
      var result;
      if (this.method != null) {
        result = this.cipher.update(buf);
        if (this.iv_sent) {
          return result;
        } else {
          this.iv_sent = true;
          return Buffer.concat([this.cipher_iv, result]);
        }
      } else {
        return substitute(this.encryptTable, buf);
      }
    };

    Encryptor.prototype.decrypt = function(buf) {
      var decipher_iv, decipher_iv_len, result;
      if (this.method != null) {
        if (this.decipher == null) {
          decipher_iv_len = this.get_cipher_len(this.method)[1];
          decipher_iv = buf.slice(0, decipher_iv_len);
          this.decipher = this.get_cipher(this.key, this.method, 0, decipher_iv);
          result = this.decipher.update(buf.slice(decipher_iv_len));
          return result;
        } else {
          result = this.decipher.update(buf);
          return result;
        }
      } else {
        return substitute(this.decryptTable, buf);
      }
    };

    return Encryptor;

  })();

  exports.Encryptor = Encryptor;

  exports.getTable = getTable;

}).call(this);
