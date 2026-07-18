// const mongoose = require('mongoose');
// const bcrypt = require('bcrypt');

// const userSchema = new mongoose.Schema(
//   {
//     username: {
//       type: String,
//       required: [true, 'Username is required'],
//       unique: true,
//       trim: true,
//       lowercase: true,
//       minlength: [3, 'Username must be at least 3 characters'],
//       index: true,
//     },
//     email: {
//       type: String,
//       required: [true, 'Email is required'],
//       unique: true,
//       trim: true,
//       lowercase: true,
//       match: [/^\S+@\S+\.\S+$/, 'Please write a valid email address'],
//       index: true,
//     },
//     password: {
//       type: String,
//       required: [true, 'Password is required'],
//       minlength: [6, 'Password must be at least 6 characters'],
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// // Hash password before saving if it is new or modified
// userSchema.pre('save', async function () {
//   if (!this.isModified('password')) return;

//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
// });

// // Compare password candidate with the hashed password in database
// userSchema.methods.comparePassword = async function (candidatePassword) {
//   return bcrypt.compare(candidatePassword, this.password);
// };

// const User = mongoose.model('User', userSchema);

// module.exports = User;

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema(
  {
    // ==========================
    // Authentication Fields
    // ==========================
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      index: true,
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please write a valid email address'],
      index: true,
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
    },

    // ==========================
    // Profile Fields
    // ==========================
    name: {
      type: String,
      default: '',
      trim: true,
    },

    phone: {
      type: String,
      default: '',
    },

    nationality: {
      type: String,
      default: '',
    },

    languages: {
      type: [String],
      default: [],
    },

    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', 'Prefer not to say', ''],
      default: '',
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    profileImage: {
      type: String,
      default: '',
    },

    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''],
      default: '',
    },

    // ==========================
    // Address
    // ==========================
    address: {
      country: {
        type: String,
        default: '',
      },
      state: {
        type: String,
        default: '',
      },
      city: {
        type: String,
        default: '',
      },
      street: {
        type: String,
        default: '',
      },
      postalCode: {
        type: String,
        default: '',
      },
    },

    // ==========================
    // Medical Information
    // ==========================
    medicalInfo: {
      allergies: {
        type: String,
        default: '',
      },
      medicalConditions: {
        type: String,
        default: '',
      },
      currentMedications: {
        type: String,
        default: '',
      },
      doctorName: {
        type: String,
        default: '',
      },
      doctorPhone: {
        type: String,
        default: '',
      },
      additionalNotes: {
        type: String,
        default: '',
      },
      organDonor: {
        type: Boolean,
        default: false,
      },
      wheelchairRequired: {
        type: Boolean,
        default: false,
      },
    },

    // ==========================
    // Emergency Settings
    // ==========================
    emergencySettings: {
      shareLiveLocation: {
        type: Boolean,
        default: false,
      },
      autoSOS: {
        type: Boolean,
        default: false,
      },
      silentSOS: {
        type: Boolean,
        default: false,
      },
      receiveWeatherAlerts: {
        type: Boolean,
        default: true,
      },
      receiveDangerZoneAlerts: {
        type: Boolean,
        default: true,
      },
      locationUpdateInterval: {
        type: Number,
        default: 60,
      },
      preferredLanguage: {
        type: String,
        default: 'English',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving if it is new or modified
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password candidate with the hashed password in database
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
