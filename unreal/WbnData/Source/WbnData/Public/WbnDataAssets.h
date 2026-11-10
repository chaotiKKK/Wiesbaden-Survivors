#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "Engine/AssetManagerTypes.h"
#include "WbnDataAssets.generated.h"

/** Eine Waffenstufe: [dmg, as, range, critC, critM, price, modifiers]. */
USTRUCT(BlueprintType)
struct FWbnWeaponTier
{
  GENERATED_BODY()

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Tier")
  float Damage = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Tier")
  float AttackSpeed = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Tier")
  float Range = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Tier")
  float CritChance = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Tier")
  float CritMultiplier = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Tier")
  float Price = 0.f;

  /** burn, slow, pierce, pellets usw.; Nicht-Zahlen stehen in PayloadJson. */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Tier")
  TMap<FName, float> Modifiers;
};

/** Eine Bossphase. */
USTRUCT(BlueprintType)
struct FWbnBossPhase
{
  GENERATED_BODY()

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Phase")
  float At = 1.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Phase")
  float Speed = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Phase")
  FName Pattern;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Phase")
  float Cooldown = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Phase")
  int32 Count = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Phase")
  float BulletSpeed = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Phase")
  float BulletDamage = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Phase")
  FName SummonId;
};

/**
 * Gemeinsame Basis aller migrierten data.js-Datensaetze.
 *
 * PayloadJson ist die verlustfreie Quelle fuer Felder, die (noch) keinen
 * typisierten UPROPERTY-Spiegel haben. Die typisierten Felder sind die stabile
 * Gameplay-Schnittstelle; der Payload bleibt fuer Werkzeuge und kuenftige
 * Felder erhalten.
 */
UCLASS(Abstract, BlueprintType)
class WBNDATA_API UWbnRecordDataAsset : public UPrimaryDataAsset
{
  GENERATED_BODY()

public:
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identity")
  FName RecordId;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identity")
  FString DisplayName;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identity")
  FString Category;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Identity")
  int32 SourceIndex = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Source")
  FString PayloadJson;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Source")
  TArray<FString> Tags;

  virtual FPrimaryAssetId GetPrimaryAssetId() const override;
};

UCLASS(BlueprintType)
class WBNDATA_API UWbnCharacterData : public UWbnRecordDataAsset
{
  GENERATED_BODY()

public:
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Character")
  FString Role;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Character")
  FString Description;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Character")
  FString PrimaryColor;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Character")
  FString SecondaryColor;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Character")
  FName StartWeapon;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Character")
  TMap<FName, float> Stats;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Ability")
  FName AbilityId;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Ability")
  FString AbilityName;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Ability")
  float AbilityCooldown = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Ability")
  FString AbilityDescription;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Synergy")
  FName SynergyClass;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Synergy")
  int32 SynergyNeed = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Synergy")
  TMap<FName, float> SynergyStats;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Synergy")
  FString SynergyText;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Source")
  FString UnlockJson;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Source")
  FString SkinJson;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Source")
  FString ProfileJson;
};

UCLASS(BlueprintType)
class WBNDATA_API UWbnWeaponData : public UWbnRecordDataAsset
{
  GENERATED_BODY()

public:
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
  TArray<FName> WeaponClasses;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
  FName WeaponType;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
  FString ColorHex;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
  TMap<FName, float> Scaling;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
  TArray<FWbnWeaponTier> Tiers;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Weapon")
  FString Special;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Unlock")
  bool UnlockDefault = false;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Unlock")
  bool Legendary = false;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Source")
  FString UnlockJson;
};

UCLASS(BlueprintType)
class WBNDATA_API UWbnItemData : public UWbnRecordDataAsset
{
  GENERATED_BODY()

public:
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Item")
  int32 Rarity = 1;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Item")
  int32 Price = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Item")
  TMap<FName, float> Stats;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Item")
  FString Flavor;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Item")
  bool Cursed = false;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Item")
  bool Turret = false;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Item")
  float Thorns = 0.f;
};

UCLASS(BlueprintType)
class WBNDATA_API UWbnEnemyData : public UWbnRecordDataAsset
{
  GENERATED_BODY()

public:
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  float MaxHealth = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  float ContactDamage = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  float MoveSpeed = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  float Radius = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  FString ColorHex;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  float Armor = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  float XpReward = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  float MaterialReward = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  FName Ai;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  FName Shape;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  FName Family;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  bool Flying = false;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  bool Phasing = false;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  int32 MinWave = 1;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  int32 SpawnWeight = 0;

  /** shot, beam, summon, split usw. als JSON, damit kein Verhalten verloren geht. */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Enemy")
  FString BehaviorJson;
};

/**
 * Live-Gegner der Fuenf-Viertel-Kampagne. Sie erben alle Basiswerte und das
 * Verhalten von UWbnEnemyData. Zusaetzlich traegt das Asset die Herkunft, die
 * AI-Familie als Archetyp und die abgeleiteten Wellen-/Viertel-Auftritte.
 *
 * Die Quelle enthaelt keine belastbare VariantOf-Verknuepfung. Deshalb bleibt
 * VariantOf leer und StandaloneCampaignEnemy steht auf true: es wird keine
 * Dublette eines data.js-Gegners und keine erfundene Variante erzeugt.
 */
UCLASS(BlueprintType)
class WBNDATA_API UWbnCampaignEnemyData : public UWbnEnemyData
{
  GENERATED_BODY()

public:
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  FString CatalogSource;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  FName Archetype;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  FString AiFamilyName;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  FString AiFamilyDescription;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  FString AiFamilyCounter;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  TArray<FString> AiFamilyParams;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  TArray<FName> CampaignDistricts;

  /** Globale Wellen 1..100, in denen dieser Gegner im Plan vorkommt. */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  TArray<int32> CampaignWaves;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  TMap<FName, int32> DistrictWaveCounts;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  int32 FirstGlobalWave = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  int32 LastGlobalWave = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  int32 WaveCount = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  bool StandaloneCampaignEnemy = true;

  /** Leer, solange die Quelle keine belegte Basis-Variante nennt. */
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Campaign")
  FName VariantOf;
};

UCLASS(BlueprintType)
class WBNDATA_API UWbnArenaData : public UWbnRecordDataAsset
{
  GENERATED_BODY()

public:
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Arena")
  float Width = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Arena")
  float Height = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Arena")
  FString GroundColor;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Arena")
  FString GridColor;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Arena")
  FString AccentColor;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Arena")
  FString Theme;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Arena")
  FString Description;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Arena")
  int32 Buildings = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Arena")
  int32 Cover = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Arena")
  int32 PoisonFields = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Arena")
  int32 SpeedFields = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Arena")
  int32 MovingWalls = 0;
};

UCLASS(BlueprintType)
class WBNDATA_API UWbnBossData : public UWbnRecordDataAsset
{
  GENERATED_BODY()

public:
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss")
  FName ArenaId;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss")
  float MaxHealth = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss")
  float Radius = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss")
  FString ColorHex;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss")
  float MoveSpeed = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss")
  float ContactDamage = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss")
  float Armor = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss")
  float MaterialReward = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss")
  float XpReward = 0.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Boss")
  TArray<FWbnBossPhase> Phases;
};

UCLASS(BlueprintType)
class WBNDATA_API UWbnDangerData : public UWbnRecordDataAsset
{
  GENERATED_BODY()

public:
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Danger")
  int32 Level = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Danger")
  float HealthMultiplier = 1.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Danger")
  float DamageMultiplier = 1.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Danger")
  float SpeedMultiplier = 1.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Danger")
  float CountMultiplier = 1.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Danger")
  float PriceMultiplier = 1.f;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Danger")
  FString Description;
};

UCLASS(BlueprintType)
class WBNDATA_API UWbnModData : public UWbnRecordDataAsset
{
  GENERATED_BODY()

public:
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Mod")
  FString ColorHex;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Mod")
  FString Description;
};

UCLASS(BlueprintType)
class WBNDATA_API UWbnAchievementData : public UWbnRecordDataAsset
{
  GENERATED_BODY()

public:
  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Achievement")
  FName ProgressKey;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Achievement")
  int32 Target = 0;

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Achievement")
  FString Description;
};
