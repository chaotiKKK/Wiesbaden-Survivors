using UnrealBuildTool;

public class WbnData : ModuleRules
{
  public WbnData(ReadOnlyTargetRules Target) : base(Target)
  {
    PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

    PublicDependencyModuleNames.AddRange(new string[]
    {
      "Core",
      "CoreUObject",
      "Engine",
    });
  }
}
