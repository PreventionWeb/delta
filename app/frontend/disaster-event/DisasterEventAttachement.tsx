import { ViewContext } from "~/frontend/context";

type DisasterEventAttachementProps = {
    ctx: ViewContext;
};

export default function DisasterEventAttachement({
    ctx,
}: DisasterEventAttachementProps) {
    return (
        <div className="col-span-12 mb-4">
            <h2 className="text-[18px] leading-[24px] font-semibold text-slate-800 tracking-[-0.01em]">
                {ctx.t({ code: "attachments", msg: "Attachements" })}
            </h2>
            <p className="mt-2 text-[14px] leading-[22px] text-slate-500">
                {ctx.t({
                    code: "upload_supporting_documents",
                    msg: "Upload supporting documents for this disaster event."
                })}
            </p>
        </div>
    );
}
