const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const addressSchema = new mongoose.Schema(
  {
    country: { type: String, default: '' },
    state: { type: String, default: '' },
    city: { type: String, default: '' },
    street: { type: String, default: '' },
    postalCode: { type: String, default: '' },
  },
  { _id: false }
);

const medicalInfoSchema = new mongoose.Schema(
  {
    allergies: { type: String, default: '' },
    medicalConditions: { type: String, default: '' },
    currentMedications: { type: String, default: '' },
    doctorName: { type: String, default: '' },
    doctorPhone: { type: String, default: '' },
    organDonor: { type: Boolean, default: false },
    wheelchairRequired: { type: Boolean, default: false },
    additionalNotes: { type: String, default: '' },
  },
  { _id: false }
);

const emergencySettingsSchema = new mongoose.Schema(
  {
    shareLiveLocation: { type: Boolean, default: false },
    autoSOS: { type: Boolean, default: false },
    silentSOS: { type: Boolean, default: false },
    locationUpdateInterval: { type: Number, default: 60 },
    preferredLanguage: { type: String, default: 'English' },
    receiveWeatherAlerts: { type: Boolean, default: true },
    receiveDangerZoneAlerts: { type: Boolean, default: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
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
    name: {
      type: String,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    profileImage: {
      type: String,
      default: null,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', 'Prefer not to say', ''],
      default: '',
    },
    nationality: {
      type: String,
      trim: true,
      default: '',
    },
    languages: {
      type: [String],
      default: [],
    },
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''],
      default: '',
    },
    address: {
      type: addressSchema,
      default: () => ({}),
    },
    medicalInfo: {
      type: medicalInfoSchema,
      default: () => ({}),
    },
    emergencySettings: {
      type: emergencySettingsSchema,
      default: () => ({}),
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving if it is new or modified
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    if (typeof next === 'function') return next();
    return;
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    if (typeof next === 'function') next();
  } catch (err) {
    if (typeof next === 'function') {
      next(err);
    } else {
      throw err;
    }
  }
});

// Compare password candidate with the hashed password in database
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
