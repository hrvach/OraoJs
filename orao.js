/* Copyright (C) 2015 Hrvoje Cavrak

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>  */

function orao(screen) {
  this.x = 0;
  this.y = 0;
  this.a = 0;
  this.sp = 0;
  this.cycles = 0;

  this.pc = 0xFF89;
  this.sp = 0xFF;
  this.flags = 48;

  this.CARRY = 1; this.ZERO = 2; this.INTERRUPT = 4;
  this.DECIMAL = 8; this.BREAK = 16; this.UNUSED = 32;
  this.OVERFLOW = 64; this.NEGATIVE = 128;

  this.memory = new Array(0xFFFF);
  for (var i=0;i<49152;i++) this.memory[i] = 0xFF;
  for (var i=0;i<16384;i++) this.memory[i+49152] = rom13[i];

  var s = this;
  this.screen = screen.getContext('2d');
  this.screen.imageSmoothingEnabled = true;

  this.tape_data = new Array();
  this.tape_ptr = 0;

  this.audio_context = new (window.AudioContext || window.webkitAudioContext)();
  this.audio_cycles = -2000000;
  this.playing = 0;

  this.get_filename = function() {
    var filename = String.fromCharCode.apply(String, this.memory.slice(592,602)).split(" ")[0];
    if (filename.length < 1) return false;

    for (var i=592;i<=602;i++)
        this.memory[i] = 32;            // Omoguci LMEM "" tako da nakon citanja brises ime fajla

    console.log(filename);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', "wav/" + filename + '.WAV', true);
    xhr.responseType = 'arraybuffer';

    this.tape_ptr++;

    var self = this;

    xhr.onload = function(e) {
      if (xhr.status == 404) {
        var container = document.getElementById("container");
        container.removeAttribute('class');
        container.offsetWidth = container.offsetWidth;  // Bez ovog trika "drma" samo jednom :)

        container.className = "shake";
        self.tape_ptr = 0;
        self.tape_data = new Array();

        // Simuliraj ctrl+C
        self.memory[0x87FD] = 223; self.memory[0x877F] = 223;
        setTimeout(function clear_ctrl_c() {
          self.memory[0x87FD] = 0xFF; self.memory[0x877F] = 0xFF;
        }, 500);
        return;
      }

      var tape = new Uint8Array(this.response);
      for (var c=45;c<=tape.length;c++) {
        self.tape_data.push(tape[c]);
        self.tape_data.push(tape[c]);
      }
    };
    xhr.send();
  }

  this.speaker = function() {
    var delta = (this.cycles - this.audio_cycles) * 2;
    var frequency = 1000000 / delta;
    if (frequency < 5000 && frequency > 40 && this.oscillator != undefined) {
      this.oscillator.frequency.value = frequency;
      if(!this.playing) {
        this.playing = 1;
        comp.oscillator.start();
      }
    }
    this.audio_cycles = this.cycles;
  }

  this.get_word = function(addr) { return 256 * this.get_byte(addr + 1) + this.get_byte(addr); }
  this.get_byte = function(addr) {
    if (addr == 0x87FF) {
      if(this.tape_ptr < 1)
        this.get_filename();

      if (this.tape_ptr > this.tape_data.length) {  // Ako smo dosli do kraja kazete
        this.tape_ptr = 0;
        this.tape_data = new Array();
      }
      else
        return 255 * (this.tape_data[this.tape_ptr++] > 128);
    }

    if (addr == 0x8800) this.speaker();

    if (addr == null)
      return this.a;
    else
      return this.memory[addr];
  }

  this.store_byte = function(addr, val) {
    if (addr == null) {
      this.a = val & 0xFF;
      return;
    }
    if (addr >= 0x6000 && addr <= 0x7FFF) {
      var pos = (addr - 0x6000) * 8;
      y = Math.floor(pos / 256);
      x = pos % 256;

      for (var k=0; k<8; k++) {
        this.screen.fillStyle = ((val>>k) & 1) ? '#ffffff' : '#404f36';
        this.screen.fillRect(2*(x+k), 2*y, 2, 2);
        }
    }

    if (addr == 0x8800) this.speaker();
    this.memory[addr] = val & 0xFF;

  }

  this.stack_push = function(value) {
    this.store_byte(256 + this.sp, value & 0xFF);
    this.sp = (this.sp - 1) & 0xFF;
  }

  this.stack_pop = function() {
    this.sp = (this.sp + 1) & 0xFF;
    return this.get_byte(256 + this.sp);
  }

  this.stack_push_word = function(val) {
    this.stack_push((val>>8) & 0xFF);
    this.stack_push(val & 0xFF);
  }

  this.stack_pop_word = function() {
    return this.stack_pop() + (this.stack_pop() << 8);
  }

  this.get_flag = function(flag) {
    return ((this.flags & flag) != 0);
  }

  this.set_flag = function(flag, boolean) {
    this.flags = (boolean != 0) ? (this.flags | flag) : (this.flags & ~(flag));
  }

  this.set_nz = function(src) {
    this.set_flag(this.ZERO, (src & 0xFF) == 0);
    this.set_flag(this.NEGATIVE, src & 0x80);
    return src;
  }

  this.im = function() { return this.pc; }
  this.zp = function() { return this.get_byte(this.pc); }
  this.zx = function() { return (this.zp() + this.x) & 0xFF; }
  this.zy = function() { return (this.zp() + this.y) & 0xFF; }
  this.ab = function() { return this.get_word(this.pc); }
  this.ax = function() { return (this.ab() + this.x) & 0xFFFF; }
  this.ay = function() { return (this.ab() + this.y) & 0xFFFF; }
  this.ix = function() { return this.get_word((this.zp() + this.x) & 0xFF); }
  this.iy = function() { return (this.get_word(this.zp()) + this.y) & 0xFFFF; }
  this.id = function() { return this.get_word(this.ab()); }
  this.jm = function() { return this.ab(); }
  this.no = function() { return null; }

  this.re = function() {
    var loc = this.zp();
    if ((loc & this.NEGATIVE) != 0)
      var addr = loc - 256 * (loc > 127);
    else
      var addr = loc;
    return (this.pc + addr) & 0xFFFF;
  }

  // Instrukcije
  this.TAX = function() { this.x = this.set_nz(this.a); }
  this.TXA = function() { this.a = this.set_nz(this.x); }
  this.TAY = function() { this.y = this.set_nz(this.a); }
  this.TYA = function() { this.a = this.set_nz(this.y); }
  this.TSX = function() { this.x = this.set_nz(this.sp); }
  this.TXS = function() { this.sp = this.x; }

  this.LDA = function(addr) { this.a = this.set_nz(this.get_byte(addr)); }
  this.LDX = function(addr) { this.x = this.set_nz(this.get_byte(addr)); }
  this.LDY = function(addr) { this.y = this.set_nz(this.get_byte(addr)); }

  this.STA = function(addr) { this.store_byte(addr, this.a); }
  this.STX = function(addr) { this.store_byte(addr, this.x); }
  this.STY = function(addr) { this.store_byte(addr, this.y); }

  this.AND = function(addr) { this.a = this.set_nz(this.get_byte(addr) & this.a); }
  this.ORA = function(addr) { this.a = this.set_nz(this.get_byte(addr) | this.a); }
  this.EOR = function(addr) { this.a = this.set_nz(this.get_byte(addr) ^ this.a); }

  this.CLC = function(d) { this.set_flag(this.CARRY, false); }
  this.SEC = function(d) { this.set_flag(this.CARRY, true); }
  this.CLD = function(d) { this.set_flag(this.DECIMAL, false); }
  this.SED = function(d) { this.set_flag(this.DECIMAL, true); }
  this.CLI = function(d) { this.set_flag(this.INTERRUPT, false); }
  this.SEI = function(d) { this.set_flag(this.INTERRUPT, true); }
  this.CLV = function(d) { this.set_flag(this.OVERFLOW, false); }

  this.INX = function() { this.x = this.set_nz((this.x + 1) & 0xFF); }
  this.INY = function() { this.y = this.set_nz((this.y + 1) & 0xFF); }
  this.DEX = function() { this.x = this.set_nz((this.x - 1) & 0xFF); }
  this.DEY = function() { this.y = this.set_nz((this.y - 1) & 0xFF); }

  this.INC = function(addr) { this.store_byte(addr, this.set_nz(this.get_byte(addr) + 1)); }
  this.DEC = function(addr) { this.store_byte(addr, this.set_nz(this.get_byte(addr) - 1)); }

  this.ASL = function(addr) {
    var operand = this.get_byte(addr);
    this.set_flag(this.CARRY, operand & 0x80);
    operand = (operand << 1) & 0xFE;
    this.store_byte(addr, this.set_nz(operand));
  }

  this.BIT = function(addr) {
    var op = this.get_byte(addr);
    this.set_flag(this.ZERO, (op & this.a) == 0);
    this.set_flag(this.NEGATIVE, op & this.NEGATIVE);
    this.set_flag(this.OVERFLOW, op & this.OVERFLOW);
  }

  this.PHP = function() { this.stack_push(this.flags | this.BREAK | this.UNUSED); }
  this.PHA = function() { this.stack_push(this.a); }
  this.PLP = function() { this.flags = this.stack_pop(); }
  this.PLA = function() { this.a = this.set_nz(this.stack_pop()); }
  this.NOP = function() {}

  this.ROR = function(addr) {
    var value = (this.get_byte(addr) >> 1) | (this.get_flag(this.CARRY)*128);
    this.set_flag(this.CARRY, this.get_byte(addr) & 1);
    this.store_byte(addr, this.set_nz(value));
  }

  this.ROL = function(addr) {
    var value = this.get_byte(addr) * 2 + this.get_flag(this.CARRY);
    this.set_flag(this.CARRY, value > 255);
    this.store_byte(addr, this.set_nz(value & 0xFF));
  }

  this.BRK = function() {
    this.stack_push_word((this.pc + 1) & 0xFFFF);
    this.set_flag(this.BREAK, true);
    this.PHP();
    this.SEI();
    this.pc = this.get_word(0xFFFE);
  }

  this.JMP = function(addr) {
    this.pc = addr - 2;
  }

  this.JSR = function(addr) {
    this.stack_push_word((this.pc + 1) & 0xFFFF);
    this.pc = addr - 2;
  }

  this.LSR = function(addr) {
    this.set_flag(this.NEGATIVE, false);
    this.set_flag(this.CARRY, this.get_byte(addr) & 1);
    this.store_byte(addr, (this.get_byte(addr) >> 1) & 0x7F);
    this.set_flag(this.ZERO, this.get_byte(addr) == 0);
  }

  this.RTI = function() {
    this.flags = this.stack_pop() | this.BREAK | this.UNUSED;
    this.pc = this.stack_pop_word();
  }

  this.RTS = function() {
    this.pc = this.stack_pop_word();
    this.pc = (this.pc + 1) & 0xFFFF;
  }

  this.addition = function(arg) {
    var result = (arg & 0xFF) + this.a + this.get_flag(this.CARRY);
    this.set_flag(this.OVERFLOW, (~(arg ^ this.a)) & (this.a ^ result) & 0x80);
    this.set_flag(this.CARRY, result > 255);
    this.a = this.set_nz(result) & 0xFF;
  }

  this.ADC = function(addr) { this.addition(this.get_byte(addr)); }
  this.SBC = function(addr) { this.addition(~this.get_byte(addr)); }

  this.compare = function(what, addr) {
    this.set_flag(this.CARRY, this.set_nz(what - this.get_byte(addr)) >= 0);
  }

  this.CMP = function(addr) { this.compare(this.a, addr); }
  this.CPX = function(addr) { this.compare(this.x, addr); }
  this.CPY = function(addr) { this.compare(this.y, addr); }

  this.branch = function(addr, flag, condition) {
    if (this.get_flag(flag) == condition) {
      this.pc = addr;
      this.cycles++;
    }
  }

  this.BCS = function(addr) { this.branch(addr, this.CARRY, true); }
  this.BCC = function(addr) { this.branch(addr, this.CARRY, false); }
  this.BEQ = function(addr) { this.branch(addr, this.ZERO, true); }
  this.BNE = function(addr) { this.branch(addr, this.ZERO, false); }
  this.BMI = function(addr) { this.branch(addr, this.NEGATIVE, true); }
  this.BPL = function(addr) { this.branch(addr, this.NEGATIVE, false); }
  this.BVS = function(addr) { this.branch(addr, this.OVERFLOW, true); }
  this.BVC = function(addr) { this.branch(addr, this.OVERFLOW, false); }


  this._opcodes = {    0x00:[s.BRK,s.no,7], 0x01:[s.ORA,s.ix,6], 0x05:[s.ORA,s.zp,3],
  0x06:[s.ASL,s.zp,5], 0x08:[s.PHP,s.no,3], 0x09:[s.ORA,s.im,2], 0x0a:[s.ASL,s.no,2],
  0x0d:[s.ORA,s.ab,4], 0x0e:[s.ASL,s.ab,6], 0x10:[s.BPL,s.re,4], 0x11:[s.ORA,s.iy,6],
  0x15:[s.ORA,s.zx,4], 0x16:[s.ASL,s.zx,6], 0x18:[s.CLC,s.no,2], 0x19:[s.ORA,s.ay,5],
  0x1d:[s.ORA,s.ax,5], 0x1e:[s.ASL,s.ax,7], 0x20:[s.JSR,s.jm,6], 0x21:[s.AND,s.ix,6],
  0x24:[s.BIT,s.zp,3], 0x25:[s.AND,s.zp,3], 0x26:[s.ROL,s.zp,5], 0x28:[s.PLP,s.no,4],
  0x29:[s.AND,s.im,2], 0x2a:[s.ROL,s.no,2], 0x2c:[s.BIT,s.ab,4], 0x2d:[s.AND,s.ab,4],
  0x2e:[s.ROL,s.ab,6], 0x30:[s.BMI,s.re,4], 0x31:[s.AND,s.iy,6], 0x35:[s.AND,s.zx,4],
  0x36:[s.ROL,s.zx,6], 0x38:[s.SEC,s.no,2], 0x39:[s.AND,s.ay,5], 0x3d:[s.AND,s.ax,5],
  0x3e:[s.ROL,s.ax,7], 0x40:[s.RTI,s.no,6], 0x41:[s.EOR,s.ix,6], 0x45:[s.EOR,s.zp,3],
  0x46:[s.LSR,s.zp,5], 0x48:[s.PHA,s.no,3], 0x49:[s.EOR,s.im,2], 0x4a:[s.LSR,s.no,2],
  0x4c:[s.JMP,s.jm,3], 0x4d:[s.EOR,s.ab,4], 0x4e:[s.LSR,s.ab,6], 0x50:[s.BVC,s.re,4],
  0x51:[s.EOR,s.iy,6], 0x55:[s.EOR,s.zx,4], 0x56:[s.LSR,s.zx,6], 0x58:[s.CLI,s.no,2],
  0x59:[s.EOR,s.ay,5], 0x5d:[s.EOR,s.ax,5], 0x5e:[s.LSR,s.ax,7], 0x60:[s.RTS,s.no,6],
  0x61:[s.ADC,s.ix,6], 0x65:[s.ADC,s.zp,3], 0x66:[s.ROR,s.zp,5], 0x68:[s.PLA,s.no,4],
  0x69:[s.ADC,s.im,2], 0x6a:[s.ROR,s.no,2], 0x6c:[s.JMP,s.id,5], 0x6d:[s.ADC,s.ab,4],
  0x6e:[s.ROR,s.ab,6], 0x70:[s.BVS,s.re,3], 0x71:[s.ADC,s.iy,6], 0x75:[s.ADC,s.zx,4],
  0x76:[s.ROR,s.zx,6], 0x78:[s.SEI,s.no,2], 0x79:[s.ADC,s.ay,5], 0x7d:[s.ADC,s.ax,5],
  0x7e:[s.ROR,s.ax,7], 0x81:[s.STA,s.ix,6], 0x84:[s.STY,s.zp,3], 0x85:[s.STA,s.zp,3],
  0x86:[s.STX,s.zp,3], 0x88:[s.DEY,s.no,2], 0x8a:[s.TXA,s.no,2], 0x8c:[s.STY,s.ab,4],
  0x8d:[s.STA,s.ab,4], 0x8e:[s.STX,s.ab,4], 0x90:[s.BCC,s.re,4], 0x91:[s.STA,s.iy,6],
  0x94:[s.STY,s.zx,4], 0x95:[s.STA,s.zx,4], 0x96:[s.STX,s.zy,4], 0x98:[s.TYA,s.no,2],
  0x99:[s.STA,s.ay,5], 0x9a:[s.TXS,s.no,2], 0x9d:[s.STA,s.ax,5], 0xa0:[s.LDY,s.im,2],
  0xa1:[s.LDA,s.ix,6], 0xa2:[s.LDX,s.im,2], 0xa4:[s.LDY,s.zp,3], 0xa5:[s.LDA,s.zp,3],
  0xa6:[s.LDX,s.zp,3], 0xa8:[s.TAY,s.no,2], 0xa9:[s.LDA,s.im,2], 0xaa:[s.TAX,s.no,2],
  0xac:[s.LDY,s.ab,4], 0xad:[s.LDA,s.ab,4], 0xae:[s.LDX,s.ab,4], 0xb0:[s.BCS,s.re,4],
  0xb1:[s.LDA,s.iy,6], 0xb4:[s.LDY,s.zx,4], 0xb5:[s.LDA,s.zx,4], 0xb6:[s.LDX,s.zy,4],
  0xb8:[s.CLV,s.no,2], 0xb9:[s.LDA,s.ay,5], 0xba:[s.TSX,s.no,2], 0xbc:[s.LDY,s.ax,5],
  0xbd:[s.LDA,s.ax,5], 0xbe:[s.LDX,s.ay,5], 0xc0:[s.CPY,s.im,2], 0xc1:[s.CMP,s.ix,6],
  0xc4:[s.CPY,s.zp,3], 0xc5:[s.CMP,s.zp,3], 0xc6:[s.DEC,s.zp,5], 0xc8:[s.INY,s.no,2],
  0xc9:[s.CMP,s.im,2], 0xca:[s.DEX,s.no,2], 0xcc:[s.CPY,s.ab,4], 0xcd:[s.CMP,s.ab,4],
  0xce:[s.DEC,s.ab,3], 0xd0:[s.BNE,s.re,4], 0xd1:[s.CMP,s.iy,6], 0xd5:[s.CMP,s.zx,4],
  0xd6:[s.DEC,s.zx,6], 0xd8:[s.CLD,s.no,2], 0xd9:[s.CMP,s.ay,5], 0xdd:[s.CMP,s.ax,5],
  0xde:[s.DEC,s.ax,7], 0xe0:[s.CPX,s.im,2], 0xe1:[s.SBC,s.ix,6], 0xe4:[s.CPX,s.zp,3],
  0xe5:[s.SBC,s.zp,3], 0xe6:[s.INC,s.zp,5], 0xe8:[s.INX,s.no,2], 0xe9:[s.SBC,s.im,2],
  0xea:[s.NOP,s.no,2], 0xec:[s.CPX,s.ab,4], 0xed:[s.SBC,s.ab,4], 0xee:[s.INC,s.ab,6],
  0xf0:[s.BEQ,s.re,4], 0xf1:[s.SBC,s.iy,6], 0xf5:[s.SBC,s.zx,4], 0xf6:[s.INC,s.zx,6],
  0xf8:[s.SED,s.no,2], 0xf9:[s.SBC,s.ay,5], 0xfd:[s.SBC,s.ax,5], 0xfe:[s.INC,s.ax,7]}

  this.im.ticks = 1; this.zp.ticks = 1; this.zx.ticks = 1; this.zy.ticks = 1;
  this.ab.ticks = 2; this.ax.ticks = 2; this.no.ticks = 0; this.ay.ticks = 2;
  this.jm.ticks = 2; this.id.ticks = 2; this.ix.ticks = 1; this.iy.ticks = 1;
  this.re.ticks = 1;


  this.keycheck = function(e, down) {
    kbd = {0x83FE: [80, 221, 219, 192],  0x83FF: [189, 48],  // [p đ š ;]  [-  0]
           0x85FE: [186, 222, 220, 187], 0x85FF: [8,   94],  // [č ć ž :]  [BS ^]
           0x86FE: [70, 72, 71, 78],     0x86FF: [66,  86],  // [f h g n]  [b  v]
           0x877E: [68, 65, 83, 90],     0x877F: [88,  67],  // [d a s z]  [x  c]
           0x87BE: [76, 74, 75, 77],     0x87BF: [44,  46],  // [l j k m]  [,  .]
           0x87DE: [69, 81, 87, 49],     0x87DF: [50,  51],  // [e q w 1]  [2  3]
           0x87EE: [79, 73, 85, 55],     0x87EF: [56,  57],  // [o i u 7]  [8  9]
           0x87F6: [82, 89, 84, 54],     0x87F7: [53,  52],  // [r y t 6]  [5  4]
           0x87FA: [112, 113, 114, 115], 0x87FD: [13,  17],  // [f1f2f3f4] [cr l_ctrl]
           0x87FC: [37, 38, 40, 39],     0x87FB: [32,  16]}  // [arrows]   [spc l_shift]

    var keyCode = (typeof(e) != "object") ? parseInt(e) : e.keyCode;

    for (var code in kbd) {
      var pos = kbd[code].indexOf(keyCode);
      if (pos != -1)
        this.memory[code] = down ? (0xFF ^ [16, 32, 64, 128][pos]) : 0xFF; // Samo jedan istovremeno za test
      }

    if (keyCode == 27) this.pc = 0xFF89;

    if (typeof(e) != "object")
        return;

    e.preventDefault();
    e.stopPropagation();
  }

  this.step = function() {
    var opcode = this.memory[this.pc];
    this.pc = (this.pc + 1) & 0xFFFF;

    var instruction = this._opcodes[opcode][0];
    var addressing = this._opcodes[opcode][1];
    var cycles = this._opcodes[opcode][2];

    instruction.call(this, addressing.call(this));

    this.pc += addressing.ticks;
    this.cycles += cycles;

  }

}

ekran = document.getElementById('screen');
var comp = new orao(ekran);

tipkovnica = document.getElementById('mapa-tipkovnica');

tipkovnica.addEventListener('click', function(e){ e.preventDefault(); });
tipkovnica.addEventListener('mousedown', function(e){ e.preventDefault(); comp.keycheck(e.target.target, 1);  });
tipkovnica.addEventListener('mouseup', function(e){ e.preventDefault(); comp.keycheck(e.target.target, 0);  });


function saveEmulatorState(compInstance) {
  var link = document.createElement("a");
  link.download = 'emulator-state.bin';
  link.href = "data:application/octet-stream," + encodeURIComponent(JSON.stringify(compInstance));

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


function loadEmulatorState() {
  var fileInput = document.createElement('input');
  fileInput.setAttribute("type", "file");

  fileInput.addEventListener('change', function(e) {
    var reader = new FileReader();
    var file = fileInput.files[0];
    reader.readAsBinaryString(file);

    reader.onload = function(e) {
      var saved = JSON.parse(reader.result);

      /* Da iscrta video memoriju upisujemo preko store_byte */
      for (var i=0; i<65536; i++)
        comp.store_byte(i, saved.memory[i]);

      for (var property in saved) {
          if(typeof(saved[property]) == "number")
              comp[property] = saved[property];
      }

    }

  });

  fileInput.click();
}

function showHideKeyboard(id) {
   var e = document.getElementById(id);
   if(e.style.display == 'block')
      e.style.display = 'none';
   else
      e.style.display = 'block';
}

window.addEventListener("keydown", function(e){ comp.keycheck(e, true); }, false);
window.addEventListener('keyup', function(e){ comp.keycheck(e, false); }, false);

function execute() {
  var time_before = new Date();
  var cycles_before = comp.cycles;

  for (var i=0; i<5000; i++)
    comp.step();

  var time_delta = (comp.cycles - cycles_before)/1000 - (new Date() - time_before);

  if (comp.cycles - comp.audio_cycles < 100000 && comp.oscillator == undefined) {
    comp.oscillator = comp.audio_context.createOscillator();
    comp.oscillator.type = 'sine';
    comp.oscillator.connect(comp.audio_context.destination);
  }
  else if(comp.cycles - comp.audio_cycles > 100000){
      try {
        comp.oscillator.stop();
        delete comp.oscillator;
      }
      catch(err) {}
      finally {
        comp.playing = 0;
      }
  }

  setTimeout("execute();", time_delta);

}

execute();
