import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, TextInput, Switch, Image, TouchableOpacity } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { colors, spacing, shapes, typography } from '../../theme/theme';
import { profileService } from '../../services/profile';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const blankMedical = { bloodGroup: '', allergies: '', medicalConditions: '', currentMedications: '', doctorName: '', doctorPhone: '', additionalNotes: '', organDonor: false, wheelchairRequired: false };
const blankSettings = { shareLiveLocation: true, autoSOS: false, silentSOS: false, receiveWeatherAlerts: true, receiveDangerZoneAlerts: true, locationUpdateInterval: 15, preferredLanguage: '' };

export const ProfileScreen = () => {
  const navigation = useNavigation();
  const { logout, isProfileComplete, completeProfile } = useAuth();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { profileService.getProfile().then(data => setForm({ ...data, medical: { ...blankMedical, ...data.medical }, settings: { ...blankSettings, ...data.settings } })); }, []);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const updateMedical = (key, value) => setForm(current => ({ ...current, medical: { ...current.medical, [key]: value } }));
  const updateSettings = (key, value) => setForm(current => ({ ...current, settings: { ...current.settings, [key]: value } }));
  const saveProfile = async () => {
    setSaving(true);
    try {
      const { medical, settings, ...personal } = form;
      await Promise.all([profileService.updateProfile(personal), profileService.updateMedical(medical), profileService.updateSettings(settings)]);
      await completeProfile();
      if (isProfileComplete) navigation.goBack();
    } finally { setSaving(false); }
  };
  if (!form) return <Screen style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></Screen>;
  const initials = form.name ? form.name.slice(0, 2).toUpperCase() : 'ST';

  return <Screen style={styles.container}>
    <View style={styles.header}><View style={styles.headerLeft}><Ionicons name="shield-checkmark" size={24} color={colors.primary} /><Text variant="headlineMd" style={styles.headerTitle}>SafeTours</Text></View><View style={styles.profilePicContainer}>{form.profileImage ? <Image source={{ uri: form.profileImage }} style={styles.profilePic} /> : <Text color={colors.primary}>{initials}</Text>}</View></View>
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.sectionHeader}><Text variant="headlineLg" style={styles.pageTitle}>{isProfileComplete ? 'Edit Profile' : 'Complete Profile'}</Text><Text variant="bodyMd" color={colors['on-surface-variant']}>Your safety is our priority. Keep your information up to date.</Text></View>
      <View style={styles.profileCard}>
        <Section title="Personal information" />
        <Field label="Name" value={form.name} onChangeText={value => update('name', value)} icon="person" />
        <Field label="Phone" value={form.phone} onChangeText={value => update('phone', value)} icon="call" keyboardType="phone-pad" />
        <Field label="Address" value={form.address} onChangeText={value => update('address', value)} icon="location" />
        <Field label="Nationality" value={form.nationality} onChangeText={value => update('nationality', value)} />
        <Field label="Languages (comma separated)" value={form.languages.join(', ')} onChangeText={value => update('languages', value.split(',').map(item => item.trim()).filter(Boolean))} />
        <Field label="Gender" value={form.gender} onChangeText={value => update('gender', value)} />
        <Field label="Date of Birth" value={form.dateOfBirth} onChangeText={value => update('dateOfBirth', value)} placeholder="YYYY-MM-DD" />
        <Field label="Profile Image URL" value={form.profileImage} onChangeText={value => update('profileImage', value)} />
        <Section title="Medical information" />
        <Field label="Blood Group" value={form.medical.bloodGroup} onChangeText={value => updateMedical('bloodGroup', value)} />
        <Field label="Allergies" value={form.medical.allergies} onChangeText={value => updateMedical('allergies', value)} multiline />
        <Field label="Medical Conditions" value={form.medical.medicalConditions} onChangeText={value => updateMedical('medicalConditions', value)} multiline />
        <Field label="Current Medications" value={form.medical.currentMedications} onChangeText={value => updateMedical('currentMedications', value)} multiline />
        <Field label="Doctor Name" value={form.medical.doctorName} onChangeText={value => updateMedical('doctorName', value)} />
        <Field label="Doctor Phone" value={form.medical.doctorPhone} onChangeText={value => updateMedical('doctorPhone', value)} keyboardType="phone-pad" />
        <Field label="Additional Notes" value={form.medical.additionalNotes} onChangeText={value => updateMedical('additionalNotes', value)} multiline />
        <Toggle label="Organ Donor" value={form.medical.organDonor} onValueChange={value => updateMedical('organDonor', value)} />
        <Toggle label="Wheelchair Required" value={form.medical.wheelchairRequired} onValueChange={value => updateMedical('wheelchairRequired', value)} />
        <Section title="Emergency settings" />
        <Toggle label="Share Live Location" value={form.settings.shareLiveLocation} onValueChange={value => updateSettings('shareLiveLocation', value)} />
        <Toggle label="Auto SOS" value={form.settings.autoSOS} onValueChange={value => updateSettings('autoSOS', value)} />
        <Toggle label="Silent SOS" value={form.settings.silentSOS} onValueChange={value => updateSettings('silentSOS', value)} />
        <Toggle label="Weather Alerts" value={form.settings.receiveWeatherAlerts} onValueChange={value => updateSettings('receiveWeatherAlerts', value)} />
        <Toggle label="Danger Zone Alerts" value={form.settings.receiveDangerZoneAlerts} onValueChange={value => updateSettings('receiveDangerZoneAlerts', value)} />
        <Field label="Location Update Interval (minutes)" value={String(form.settings.locationUpdateInterval)} onChangeText={value => updateSettings('locationUpdateInterval', Number(value) || 0)} keyboardType="numeric" />
        <Field label="Preferred Language" value={form.settings.preferredLanguage} onChangeText={value => updateSettings('preferredLanguage', value)} />
      </View><View style={{ height: 120 }} />
    </ScrollView>
    <View style={styles.bottomActions}><TouchableOpacity style={styles.continueBtn} onPress={saveProfile} disabled={saving}><Text variant="labelLg" color={colors['on-primary']} style={styles.continueText}>{saving ? 'Saving...' : (isProfileComplete ? 'Save Changes' : 'Continue')}</Text><Ionicons name="arrow-forward" size={20} color={colors['on-primary']} /></TouchableOpacity>{!isProfileComplete && <TouchableOpacity onPress={logout} style={styles.logoutBtn}><Text style={styles.logoutText}>Log Out</Text></TouchableOpacity>}</View>
  </Screen>;
};

const Section = ({ title }) => <Text variant="labelLg" color={colors.primary} style={styles.groupTitle}>{title}</Text>;
const Field = ({ label, icon, multiline, ...props }) => <View style={styles.inputGroup}><Text variant="labelLg" color={colors['on-surface-variant']} style={styles.inputLabel}>{label}</Text><View style={styles.inputWrapper}><TextInput {...props} style={[styles.input, multiline && styles.textArea]} multiline={multiline} placeholderTextColor="rgba(134, 115, 106, 0.5)" textAlignVertical={multiline ? 'top' : 'center'} />{icon && <Ionicons name={icon} size={20} color="rgba(134, 115, 106, 0.5)" style={styles.inputIcon} />}</View></View>;
const Toggle = ({ label, value, onValueChange }) => <View style={styles.toggleContainer}><Text variant="labelLg" style={styles.toggleTitle}>{label}</Text><Switch trackColor={{ false: colors['outline-variant'], true: colors['primary-container'] }} thumbColor={colors['on-primary']} value={value} onValueChange={onValueChange} /></View>;

const styles = StyleSheet.create({ container:{flex:1,backgroundColor:colors.background},loadingContainer:{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:colors.background},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:spacing.lg,paddingVertical:spacing.md,backgroundColor:'rgba(255, 248, 246, 0.9)',borderBottomWidth:1,borderBottomColor:'rgba(217, 194, 183, 0.3)'},headerLeft:{flexDirection:'row',alignItems:'center',gap:spacing.sm},headerTitle:{color:colors.primary,fontWeight:'bold'},profilePicContainer:{width:40,height:40,borderRadius:20,backgroundColor:colors['surface-container-high'],overflow:'hidden',borderWidth:1,borderColor:'rgba(217, 194, 183, 0.3)',alignItems:'center',justifyContent:'center'},profilePic:{width:'100%',height:'100%'},scrollContent:{padding:spacing.lg,paddingTop:spacing.xl},sectionHeader:{marginBottom:spacing.xl,gap:8},pageTitle:{fontSize:28,fontWeight:'bold',color:colors['on-surface'],letterSpacing:-0.5},profileCard:{backgroundColor:'#F8F6F4',borderWidth:1,borderColor:'#E7D6CC',borderRadius:shapes.roundedLg,padding:spacing.xl,gap:spacing.lg,shadowColor:'#000',shadowOffset:{width:0,height:10},shadowOpacity:0.08,shadowRadius:20,elevation:5},groupTitle:{textTransform:'uppercase',fontWeight:'bold',marginTop:spacing.sm},inputGroup:{gap:8},inputLabel:{paddingHorizontal:4},inputWrapper:{position:'relative',justifyContent:'center'},input:{height:56,backgroundColor:colors.surface,borderRadius:12,paddingHorizontal:spacing.md,fontSize:typography.sizes.bodyLg,fontFamily:typography.fontFamily,color:colors['on-surface']},inputIcon:{position:'absolute',right:spacing.md},textArea:{height:100,paddingVertical:spacing.md},toggleContainer:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:colors['surface-container-low'],padding:spacing.md,borderRadius:12},toggleTitle:{fontWeight:'600',color:colors['on-surface']},bottomActions:{position:'absolute',bottom:0,left:0,right:0,padding:spacing.xl,backgroundColor:'rgba(255, 248, 246, 0.9)',borderTopWidth:1,borderTopColor:'rgba(217, 194, 183, 0.2)',alignItems:'center',gap:spacing.md},continueBtn:{width:'100%',height:56,backgroundColor:colors['primary-container'],borderRadius:shapes.roundedPill,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,elevation:4},continueText:{fontSize:18},logoutBtn:{marginTop:spacing.sm},logoutText:{color:colors.error,fontWeight:'bold'} });
