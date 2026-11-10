#include "WbnDataAssets.h"

FPrimaryAssetId UWbnRecordDataAsset::GetPrimaryAssetId() const
{
  // Der Kategorie-String ist zugleich der PrimaryAssetType, damit der
  // AssetManager Charaktere, Waffen und Gegner getrennt scannen kann.
  return FPrimaryAssetId(FPrimaryAssetType(FName(*Category)), RecordId);
}
