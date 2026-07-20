#!/usr/bin/env python3
"""
Crime Hotspots Generation Script using DBSCAN.
Author: Antigravity AI
Date: 2026-07-20
"""

import os
import pandas as pd
import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.metrics import pairwise_distances

# Configuration Constants
EARTH_RADIUS_METERS = 6371000  # Average radius of the Earth in meters
RADIUS_METERS = 200            # Clustering radius in meters (DBSCAN eps)
MIN_SAMPLES = 3                # Minimum samples to form a cluster (DBSCAN min_samples)

INPUT_FILE = "crime_clean.csv"
OUTPUT_HOTSPOTS_FILE = "crime_hotspots.csv"
OUTPUT_LABELED_FILE = "crime_labeled.csv"

def load_and_clean_data(file_path):
    """
    Loads dataset and cleans invalid/missing coordinate values.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Input file not found: {file_path}")
    
    print(f"Loading data from {file_path}...")
    df = pd.read_csv(file_path)
    original_count = len(df)
    
    # Detect pre-existing missing values in Latitude or Longitude
    missing_coords = df["Latitude"].isnull() | df["Longitude"].isnull()
    
    # Try converting to numeric; invalid entries will become NaN
    df["Latitude"] = pd.to_numeric(df["Latitude"], errors="coerce")
    df["Longitude"] = pd.to_numeric(df["Longitude"], errors="coerce")
    
    # Out of bounds coordinates check
    invalid_bounds = (
        (df["Latitude"] < -90) | (df["Latitude"] > 90) |
        (df["Longitude"] < -180) | (df["Longitude"] > 180)
    )
    
    # Combined filter for invalid/missing coordinates
    invalid_rows_mask = missing_coords | df["Latitude"].isnull() | df["Longitude"].isnull() | invalid_bounds
    
    clean_df = df[~invalid_rows_mask].copy()
    dropped_count = original_count - len(clean_df)
    
    print(f"Loaded {original_count} records.")
    if dropped_count > 0:
        print(f"Dropped {dropped_count} invalid/missing coordinate records.")
    else:
        print("All coordinate fields are valid. No records dropped.")
        
    # Impute missing Crime_Severity using median severity of the Crime_Type
    clean_df["Crime_Severity"] = pd.to_numeric(clean_df["Crime_Severity"], errors="coerce")
    
    # Calculate median severity by Crime_Type to impute missing values
    medians_by_type = clean_df.groupby("Crime_Type")["Crime_Severity"].transform("median")
    
    # Fallback overall median in case a crime type has all missing severities
    overall_median = clean_df["Crime_Severity"].median()
    if pd.isna(overall_median):
        overall_median = 5.0
        
    clean_df["Crime_Severity"] = clean_df["Crime_Severity"].fillna(medians_by_type).fillna(overall_median)
    
    return clean_df


def compute_coordinate_diagnostics(df):
    """
    Computes and prints coordinate statistics and distance distributions to diagnose sparsity.
    """
    coords = df[["Latitude", "Longitude"]].dropna().to_numpy()
    if len(coords) == 0:
        print("Error: No coordinates available for diagnostics.")
        return
    
    lat_min, lat_max = coords[:, 0].min(), coords[:, 0].max()
    lon_min, lon_max = coords[:, 1].min(), coords[:, 1].max()
    
    print("\n--- Coordinate Validation & Diagnostics ---")
    print(f"Coordinate Range:")
    print(f"  Latitude:  [{lat_min:.6f}, {lat_max:.6f}] (Span: {lat_max - lat_min:.3f} degrees)")
    print(f"  Longitude: [{lon_min:.6f}, {lon_max:.6f}] (Span: {lon_max - lon_min:.3f} degrees)")
    print(f"Total valid coordinate records: {len(coords)}")
    
    # Compute sample-based pairwise distances in meters to understand scale
    coords_rad = np.radians(coords)
    sample_size = min(500, len(coords_rad))
    sample_coords_rad = coords_rad[:sample_size]
    
    dists_rad = pairwise_distances(sample_coords_rad, metric="haversine")
    dists_meters = dists_rad * EARTH_RADIUS_METERS
    
    # Exclude self-distance (zeroes)
    mask = dists_meters > 0.0
    if mask.any():
        non_zero_dists = dists_meters[mask]
        min_dist = non_zero_dists.min()
        pct_5 = np.percentile(non_zero_dists, 5)
        pct_10 = np.percentile(non_zero_dists, 10)
        median_dist = np.percentile(non_zero_dists, 50)
        max_dist = non_zero_dists.max()
        
        print(f"Pairwise Distance Statistics between points (in meters, sample size = {sample_size}):")
        print(f"  Minimum distance:  {min_dist:.2f} meters")
        print(f"  5th percentile:    {pct_5:.2f} meters")
        print(f"  10th percentile:   {pct_10:.2f} meters")
        print(f"  Median distance:   {median_dist:.2f} meters")
        print(f"  Maximum distance:  {max_dist:.2f} meters")
    else:
        print("  All sample coordinates are identical.")
    print("-------------------------------------------\n")


def find_suggested_parameters(df):
    """
    Searches for optimal eps (radius in meters) and min_samples when the default configuration
    yields no clusters. Evaluates standard values, returning the smallest eps that yields at
    least 3 clusters and keeps the noise ratio under 95%.
    """
    coords = df[["Latitude", "Longitude"]].to_numpy()
    coords_rad = np.radians(coords)
    
    print("Automatically searching for suitable DBSCAN parameters...")
    
    # Range of candidate values to test (in meters)
    eps_values_m = [500, 1000, 2000, 5000, 10000, 15000, 20000, 30000, 50000]
    min_samples_values = [2, 3, 5]
    
    candidates = []
    
    for eps_m in eps_values_m:
        eps_rad = eps_m / EARTH_RADIUS_METERS
        for min_samples in min_samples_values:
            db = DBSCAN(eps=eps_rad, min_samples=min_samples, metric="haversine")
            labels = db.fit_predict(coords_rad)
            
            unique_labels = set(labels)
            n_clusters = len(unique_labels) - (1 if -1 in unique_labels else 0)
            n_noise = list(labels).count(-1)
            noise_pct = (n_noise / len(labels)) * 100.0
            
            # Log the search trial
            print(f"  Tested eps = {eps_m}m, min_samples = {min_samples} => {n_clusters} clusters, {noise_pct:.1f}% noise")
            
            if n_clusters >= 3 and noise_pct < 95.0:
                candidates.append({
                    "eps_meters": eps_m,
                    "min_samples": min_samples,
                    "n_clusters": n_clusters,
                    "noise_pct": noise_pct
                })
                
    if candidates:
        # Prefer candidate with noise percentage < 90% and smallest eps_meters
        good_candidates = [c for c in candidates if c["noise_pct"] < 90.0]
        if good_candidates:
            best = good_candidates[0]
        else:
            best = candidates[0]
            
        print(f"\nRecommended optimal parameters found:")
        print(f"  -> RADIUS_METERS (eps) = {best['eps_meters']}m")
        print(f"  -> MIN_SAMPLES = {best['min_samples']}")
        print(f"  -> Expecting {best['n_clusters']} clusters and {best['noise_pct']:.1f}% noise.\n")
        return best["eps_meters"], best["min_samples"]
    
    # Fallback suggestion
    print("Could not find parameters satisfying all thresholds. Falling back to default suggestion: eps=15000m, min_samples=3")
    return 15000, 3


def run_dbscan(df, radius_meters, min_samples):
    """
    Runs DBSCAN clustering on Latitude and Longitude using Haversine distance.
    """
    print(f"Running DBSCAN clustering with radius = {radius_meters}m, min_samples = {min_samples}...")
    
    # Select coordinates and convert to radians for Haversine metric
    # The order must be [Latitude, Longitude]
    coords = df[["Latitude", "Longitude"]].to_numpy()
    coords_rad = np.radians(coords)
    
    # Compute eps in radians
    eps_rad = radius_meters / EARTH_RADIUS_METERS
    
    # Initialize and run DBSCAN
    db = DBSCAN(eps=eps_rad, min_samples=min_samples, metric="haversine")
    cluster_labels = db.fit_predict(coords_rad)
    
    df["Cluster"] = cluster_labels
    
    # Log summary of clustering
    unique_labels = set(cluster_labels)
    n_clusters = len(unique_labels) - (1 if -1 in unique_labels else 0)
    n_noise = list(cluster_labels).count(-1)
    
    print(f"Identified {n_clusters} clusters and {n_noise} noise points.")
    return df

def generate_hotspots(df):
    """
    Groups labeled crimes by cluster (excluding noise) and aggregates metrics for hotspots.
    """
    print("Generating crime hotspots summary...")
    
    # Exclude noise points (-1)
    hotspots_df = df[df["Cluster"] != -1].copy()
    
    if hotspots_df.empty:
        print("No clusters identified. Hotspots CSV will be empty (headers only).")
        # Create empty dataframe with required structure
        empty_hotspots = pd.DataFrame(columns=[
            "Hotspot_ID", "Center_Latitude", "Center_Longitude", 
            "Crime_Count", "Average_Crime_Severity", "Maximum_Crime_Severity", "Crime_Types"
        ])
        return empty_hotspots
    
    # Custom aggregation function to get unique sorted comma-separated string of crime types
    def aggregate_crime_types(series):
        # Drop duplicates, sort, and join with comma
        return ", ".join(sorted(series.dropna().astype(str).unique()))
    
    # Make sure Crime_Severity is numeric for aggregation
    hotspots_df["Crime_Severity"] = pd.to_numeric(hotspots_df["Crime_Severity"], errors="coerce")
    
    # Group by Cluster and aggregate
    grouped = hotspots_df.groupby("Cluster").agg(
        Center_Latitude=("Latitude", "mean"),
        Center_Longitude=("Longitude", "mean"),
        Crime_Count=("Cluster", "count"),
        Average_Crime_Severity=("Crime_Severity", "mean"),
        Maximum_Crime_Severity=("Crime_Severity", "max"),
        Crime_Types=("Crime_Type", aggregate_crime_types)
    ).reset_index()
    
    # Rename Cluster to Hotspot_ID
    grouped.rename(columns={"Cluster": "Hotspot_ID"}, inplace=True)
    
    return grouped

def compute_crime_scores(hotspots_df):
    """
    Computes Crime_Score (0-100) and assigns Risk_Level (Safe, Low, Moderate, High, Extreme)
    for each hotspot based on Crime_Count, Average_Crime_Severity, and Maximum_Crime_Severity.
    """
    if hotspots_df.empty:
        # If no hotspots exist, add the empty columns
        hotspots_df["Crime_Score"] = []
        hotspots_df["Risk_Level"] = []
        return hotspots_df

    print("Computing Crime Scores and Risk Levels...")

    # Extract inputs and fill NaNs just in case
    avg_sev = hotspots_df["Average_Crime_Severity"].fillna(5.0)
    max_sev = hotspots_df["Maximum_Crime_Severity"].fillna(5.0)
    counts = hotspots_df["Crime_Count"].fillna(1)

    # 1. Calculate Raw Score
    # Formula: 0.5 * Average_Severity + 0.3 * Maximum_Severity + 0.2 * log(Crime_Count)
    raw_scores = (0.5 * avg_sev) + (0.3 * max_sev) + (0.2 * np.log(counts))

    # 2. Normalize raw scores to 0-100
    min_raw = raw_scores.min()
    max_raw = raw_scores.max()

    if max_raw > min_raw:
        crime_scores = 100.0 * (raw_scores - min_raw) / (max_raw - min_raw)
    else:
        # Fallback if all raw scores are identical
        crime_scores = pd.Series([50.0] * len(hotspots_df))

    # Add to dataframe (rounded to 2 decimal places)
    hotspots_df["Crime_Score"] = crime_scores.round(2)

    # 3. Assign Risk Level based on Crime Score thresholds
    def assign_risk_level(score):
        if score < 20.0:
            return "Safe"
        elif score < 40.0:
            return "Low"
        elif score < 60.0:
            return "Moderate"
        elif score < 80.0:
            return "High"
        else:
            return "Extreme"

    hotspots_df["Risk_Level"] = hotspots_df["Crime_Score"].apply(assign_risk_level)

    return hotspots_df


def main():
    # 1. Load and clean
    df_clean = load_and_clean_data(INPUT_FILE)
    
    # Run coordinate validation and statistics
    compute_coordinate_diagnostics(df_clean)
    
    # 2. Cluster
    radius = RADIUS_METERS
    min_samples = MIN_SAMPLES
    
    df_labeled = run_dbscan(df_clean, radius, min_samples)
    
    unique_labels = set(df_labeled["Cluster"])
    n_clusters = len(unique_labels) - (1 if -1 in unique_labels else 0)
    
    if n_clusters == 0:
        print("\n[WARNING] Default DBSCAN configuration yielded 0 clusters.")
        print(f"Coordinates are too sparse for RADIUS_METERS = {RADIUS_METERS}m.")
        
        # Auto-suggest better values
        sug_radius, sug_min_samples = find_suggested_parameters(df_clean)
        print(f"Auto-tuning: Re-running DBSCAN with RADIUS_METERS = {sug_radius}m and MIN_SAMPLES = {sug_min_samples}...")
        
        df_labeled = run_dbscan(df_clean, sug_radius, sug_min_samples)
    
    # Save labeled crimes
    df_labeled.to_csv(OUTPUT_LABELED_FILE, index=False)
    print(f"Labeled crimes saved to {OUTPUT_LABELED_FILE}")
    
    # 3. Generate hotspots
    hotspots_df = generate_hotspots(df_labeled)
    
    # Compute Crime Scores and Risk Levels
    hotspots_df = compute_crime_scores(hotspots_df)
    
    # Save hotspots
    hotspots_df.to_csv(OUTPUT_HOTSPOTS_FILE, index=False)
    print(f"Hotspot summaries (with Crime Score and Risk Level) saved to {OUTPUT_HOTSPOTS_FILE}")
    
    # 4. Self-verification
    print("\n--- Output Verification Summary ---")
    print(f"Hotspots File Exists: {os.path.exists(OUTPUT_HOTSPOTS_FILE)}")
    print(f"Total Hotspots Generated: {len(hotspots_df)}")
    if not hotspots_df.empty:
        print("\nFirst few hotspots:")
        print(hotspots_df.head())
    print("-----------------------------------")

if __name__ == "__main__":
    main()